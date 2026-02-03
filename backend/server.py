from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
import routeros_api
from cryptography.fernet import Fernet
import base64
from bson import ObjectId
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from io import BytesIO
from fastapi.responses import StreamingResponse
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.environ.get('SECRET_KEY', 'billing-secret-key-change-in-production')
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'encryption-key-change-in-production-32b').encode()
if len(ENCRYPTION_KEY) < 32:
    ENCRYPTION_KEY = ENCRYPTION_KEY.ljust(32, b'0')
fernet_key = base64.urlsafe_b64encode(ENCRYPTION_KEY[:32])
fernet = Fernet(fernet_key)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

app = FastAPI(title="Billing System API")
api_router = APIRouter(prefix="/api")

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ========== MODELS ==========
class User(BaseModel):
    username: str
    full_name: str
    role: str
    password: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    full_name: str
    role: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class MikrotikConfig(BaseModel):
    name: str
    ip_address: str
    port: int = 8728
    username: str
    password: str
    version: str = "v7"
    is_active: bool = True

class PPPoEAccount(BaseModel):
    username: str
    password: str
    profile: str
    remote_address: Optional[str] = None
    service: str = "pppoe"
    disabled: bool = False

class Subscriber(BaseModel):
    account_number: str
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    pppoe_username: Optional[str] = None
    pppoe_password: Optional[str] = None
    pppoe_profile: Optional[str] = None
    activate_pppoe: bool = False
    plan_id: Optional[str] = None
    billing_period: str = "30th"
    installation_date: Optional[datetime] = None
    is_active: bool = True
    modem_mac: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SubscriptionPlan(BaseModel):
    name: str
    speed: str
    price: float
    description: Optional[str] = None
    is_active: bool = True

class Invoice(BaseModel):
    invoice_number: str
    subscriber_id: str
    amount: float
    due_date: datetime
    paid: bool = False
    paid_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Payment(BaseModel):
    invoice_id: str
    subscriber_id: str
    amount: float
    mode: str
    or_number: Optional[str] = None
    si_number: Optional[str] = None
    received_by: str
    notes: Optional[str] = None
    payment_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class JobOrder(BaseModel):
    subscriber_id: str
    type: str
    description: str
    status: str = "Open"
    priority: str = "Normal"
    assigned_to: Optional[str] = None
    materials_used: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None

class Inventory(BaseModel):
    name: str
    category: str
    quantity: float
    unit: str
    cost_per_unit: float
    mac_address: Optional[str] = None
    serial_number: Optional[str] = None
    is_bulk: bool = False

class Expense(BaseModel):
    category: str
    description: str
    amount: float
    is_recurring: bool = False
    expense_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CompanySettings(BaseModel):
    business_name: str
    address: str
    email: str
    mobile: str
    logo_url: Optional[str] = None

# ========== HELPER FUNCTIONS ==========
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def encrypt_password(password: str) -> str:
    return fernet.encrypt(password.encode()).decode()

def decrypt_password(encrypted: str) -> str:
    return fernet.decrypt(encrypted.encode()).decode()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"username": username}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def generate_account_number() -> str:
    return f"ACC{str(uuid.uuid4())[:8].upper()}"

def generate_invoice_number() -> str:
    return f"INV{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}"

# ========== MIKROTIK HELPER ==========
class MikrotikService:
    def __init__(self, config: dict):
        self.config = config
        self.connection = None

    def connect(self) -> bool:
        try:
            password = decrypt_password(self.config['password'])
            self.connection = routeros_api.RouterOsApiPool(
                self.config['ip_address'],
                username=self.config['username'],
                password=password,
                port=self.config['port'],
                plaintext_login=True
            )
            self.api = self.connection.get_api()
            return True
        except Exception as e:
            logger.error(f"Mikrotik connection failed: {e}")
            return False

    def disconnect(self):
        if self.connection:
            self.connection.disconnect()

    def get_resource_stats(self) -> dict:
        try:
            resource = self.api.get_resource('/system/resource')
            stats = resource.get()
            if stats:
                return {
                    'cpu_load': stats[0].get('cpu-load', '0'),
                    'free_memory': stats[0].get('free-memory', '0'),
                    'total_memory': stats[0].get('total-memory', '0'),
                    'uptime': stats[0].get('uptime', '0')
                }
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
        return {}

    def get_pppoe_secrets(self) -> list:
        try:
            resource = self.api.get_resource('/ppp/secret')
            return resource.get()
        except Exception as e:
            logger.error(f"Failed to get secrets: {e}")
            return []
    
    def get_pppoe_profiles(self) -> list:
        try:
            resource = self.api.get_resource('/ppp/profile')
            profiles = resource.get()
            return [p.get('name') for p in profiles if p.get('name')]
        except Exception as e:
            logger.error(f"Failed to get profiles: {e}")
            return []
    
    def pppoe_account_exists(self, username: str) -> bool:
        try:
            resource = self.api.get_resource('/ppp/secret')
            secrets = resource.get()
            return any(s.get('name') == username for s in secrets)
        except Exception as e:
            logger.error(f"Failed to check account: {e}")
            return False

    def create_pppoe_account(self, account: PPPoEAccount) -> bool:
        try:
            resource = self.api.get_resource('/ppp/secret')
            data = {
                'name': account.username,
                'password': account.password,
                'profile': account.profile,
                'service': account.service
            }
            if account.remote_address:
                data['remote-address'] = account.remote_address
            resource.add(**data)
            return True
        except Exception as e:
            logger.error(f"Failed to create account: {e}")
            return False

# ========== AUTH ENDPOINTS ==========
@api_router.post("/auth/register")
async def register_user(user: UserCreate):
    existing = await db.users.find_one({"username": user.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user_dict = user.model_dump()
    user_dict['password'] = hash_password(user.password)
    user_dict['created_at'] = datetime.now(timezone.utc)
    await db.users.insert_one(user_dict)
    return {"message": "User created successfully"}

@api_router.post("/auth/login")
async def login(user: UserLogin):
    db_user = await db.users.find_one({"username": user.username})
    if not db_user or not verify_password(user.password, db_user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not db_user.get('is_active', True):
        raise HTTPException(status_code=401, detail="Account is inactive")
    
    token = create_access_token({"sub": user.username, "role": db_user['role']})
    return {"access_token": token, "role": db_user['role'], "username": user.username}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# ========== USER MANAGEMENT ==========
@api_router.get("/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.post("/users")
async def create_user(user: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.users.find_one({"username": user.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user_dict = user.model_dump()
    user_dict['password'] = hash_password(user.password)
    user_dict['created_at'] = datetime.now(timezone.utc)
    await db.users.insert_one(user_dict)
    return {"message": "User created successfully"}

@api_router.put("/users/{username}")
async def update_user(username: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if 'password' in updates:
        updates['password'] = hash_password(updates['password'])
    
    await db.users.update_one({"username": username}, {"$set": updates})
    return {"message": "User updated successfully"}

@api_router.delete("/users/{username}")
async def delete_user(username: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.users.delete_one({"username": username})
    return {"message": "User deleted successfully"}

# ========== MIKROTIK MANAGEMENT ==========
@api_router.post("/mikrotik/config")
async def save_mikrotik_config(config: MikrotikConfig, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    config_dict = config.model_dump()
    config_dict['password'] = encrypt_password(config.password)
    config_dict['created_at'] = datetime.now(timezone.utc)
    
    await db.mikrotik_configs.delete_many({})
    await db.mikrotik_configs.insert_one(config_dict)
    return {"message": "Mikrotik configuration saved"}

@api_router.get("/mikrotik/config")
async def get_mikrotik_config(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    config = await db.mikrotik_configs.find_one({}, {"_id": 0, "password": 0})
    return config or {}

@api_router.get("/mikrotik/stats")
async def get_mikrotik_stats(current_user: dict = Depends(get_current_user)):
    config = await db.mikrotik_configs.find_one({})
    if not config:
        raise HTTPException(status_code=404, detail="Mikrotik not configured")
    
    service = MikrotikService(config)
    if service.connect():
        stats = service.get_resource_stats()
        service.disconnect()
        return stats
    raise HTTPException(status_code=500, detail="Failed to connect to Mikrotik")

@api_router.post("/mikrotik/pppoe")
async def create_mikrotik_pppoe(account: PPPoEAccount, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    config = await db.mikrotik_configs.find_one({})
    if not config:
        raise HTTPException(status_code=404, detail="Mikrotik not configured")
    
    service = MikrotikService(config)
    if service.connect():
        success = service.create_pppoe_account(account)
        service.disconnect()
        if success:
            return {"message": "PPPoE account created"}
    raise HTTPException(status_code=500, detail="Failed to create account")

@api_router.get("/mikrotik/profiles")
async def get_mikrotik_profiles(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'tech', 'user']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    config = await db.mikrotik_configs.find_one({})
    if not config:
        raise HTTPException(status_code=404, detail="Mikrotik not configured")
    
    service = MikrotikService(config)
    if service.connect():
        profiles = service.get_pppoe_profiles()
        service.disconnect()
        return {"profiles": profiles}
    raise HTTPException(status_code=500, detail="Failed to connect to Mikrotik")

@api_router.post("/subscribers/{account_number}/activate-pppoe")
async def activate_subscriber_pppoe(account_number: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'user']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get subscriber
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    # Check if PPPoE credentials exist
    if not subscriber.get('pppoe_username') or not subscriber.get('pppoe_password') or not subscriber.get('pppoe_profile'):
        raise HTTPException(status_code=400, detail="PPPoE credentials not configured for this subscriber")
    
    # Get Mikrotik config
    mikrotik_config = await db.mikrotik_configs.find_one({})
    if not mikrotik_config:
        raise HTTPException(status_code=404, detail="Mikrotik not configured")
    
    # Create PPPoE account
    service = MikrotikService(mikrotik_config)
    if service.connect():
        pppoe_account = PPPoEAccount(
            username=subscriber['pppoe_username'],
            password=subscriber['pppoe_password'],
            profile=subscriber['pppoe_profile'],
            remote_address='',
            service="pppoe",
            disabled=False
        )
        success = service.create_pppoe_account(pppoe_account)
        service.disconnect()
        
        if success:
            return {"message": "PPPoE account activated in Mikrotik", "success": True}
        raise HTTPException(status_code=500, detail="Failed to create PPPoE account")
    raise HTTPException(status_code=500, detail="Failed to connect to Mikrotik")

@api_router.get("/subscribers/{account_number}/pppoe-status")
async def check_pppoe_status(account_number: str, current_user: dict = Depends(get_current_user)):
    # Get subscriber
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    if not subscriber.get('pppoe_username'):
        return {"exists": False, "configured": False}
    
    # Check in Mikrotik
    mikrotik_config = await db.mikrotik_configs.find_one({})
    if not mikrotik_config:
        return {"exists": False, "configured": True, "error": "Mikrotik not configured"}
    
    service = MikrotikService(mikrotik_config)
    if service.connect():
        exists = service.pppoe_account_exists(subscriber['pppoe_username'])
        service.disconnect()
        return {"exists": exists, "configured": True}
    
    return {"exists": False, "configured": True, "error": "Failed to connect to Mikrotik"}

@api_router.post("/subscribers/bulk-activate-pppoe")
async def bulk_activate_pppoe(account_numbers: list[str], current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'user']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get Mikrotik config
    mikrotik_config = await db.mikrotik_configs.find_one({})
    if not mikrotik_config:
        raise HTTPException(status_code=404, detail="Mikrotik not configured")
    
    service = MikrotikService(mikrotik_config)
    if not service.connect():
        raise HTTPException(status_code=500, detail="Failed to connect to Mikrotik")
    
    results = {
        "success": [],
        "failed": [],
        "skipped": []
    }
    
    for account_number in account_numbers:
        subscriber = await db.subscribers.find_one({"account_number": account_number})
        if not subscriber:
            results["skipped"].append({"account_number": account_number, "reason": "Not found"})
            continue
        
        if not subscriber.get('pppoe_username') or not subscriber.get('pppoe_password') or not subscriber.get('pppoe_profile'):
            results["skipped"].append({"account_number": account_number, "reason": "PPPoE not configured"})
            continue
        
        # Check if already exists
        if service.pppoe_account_exists(subscriber['pppoe_username']):
            results["skipped"].append({"account_number": account_number, "reason": "Already exists"})
            continue
        
        # Create account
        pppoe_account = PPPoEAccount(
            username=subscriber['pppoe_username'],
            password=subscriber['pppoe_password'],
            profile=subscriber['pppoe_profile'],
            remote_address='',
            service="pppoe",
            disabled=False
        )
        
        if service.create_pppoe_account(pppoe_account):
            results["success"].append(account_number)
        else:
            results["failed"].append(account_number)
    
    service.disconnect()
    
    return {
        "message": f"Activated {len(results['success'])} accounts",
        "results": results
    }
async def sync_mikrotik_accounts(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    config = await db.mikrotik_configs.find_one({})
    if not config:
        raise HTTPException(status_code=404, detail="Mikrotik not configured")
    
    service = MikrotikService(config)
    if service.connect():
        secrets = service.get_pppoe_secrets()
        service.disconnect()
        
        for secret in secrets:
            await db.pppoe_accounts.update_one(
                {"username": secret.get('name')},
                {"$set": {
                    "username": secret.get('name'),
                    "profile": secret.get('profile', 'default'),
                    "service": secret.get('service', 'pppoe'),
                    "disabled": secret.get('disabled', False),
                    "synced_at": datetime.now(timezone.utc)
                }},
                upsert=True
            )
        return {"message": f"Synced {len(secrets)} accounts"}
    raise HTTPException(status_code=500, detail="Failed to sync accounts")

# ========== SUBSCRIPTION PLANS ==========
@api_router.get("/plans")
async def list_plans():
    plans = await db.subscription_plans.find({}, {"_id": 0}).to_list(1000)
    return plans

@api_router.post("/plans")
async def create_plan(plan: SubscriptionPlan, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.subscription_plans.insert_one(plan.model_dump())
    return {"message": "Plan created successfully"}

# ========== SUBSCRIBER MANAGEMENT ==========
@api_router.get("/subscribers")
async def list_subscribers(current_user: dict = Depends(get_current_user)):
    subscribers = await db.subscribers.find({}, {"_id": 0}).to_list(1000)
    return subscribers

@api_router.post("/subscribers")
async def create_subscriber(subscriber: Subscriber, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'user']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not subscriber.account_number:
        subscriber.account_number = generate_account_number()
    
    # Check if PPPoE activation is requested
    pppoe_created = False
    pppoe_error = None
    
    if subscriber.activate_pppoe and subscriber.pppoe_username and subscriber.pppoe_password and subscriber.pppoe_profile:
        # Get Mikrotik config
        mikrotik_config = await db.mikrotik_configs.find_one({})
        
        if mikrotik_config:
            try:
                # Create PPPoE account in Mikrotik
                service = MikrotikService(mikrotik_config)
                if service.connect():
                    pppoe_account = PPPoEAccount(
                        username=subscriber.pppoe_username,
                        password=subscriber.pppoe_password,
                        profile=subscriber.pppoe_profile,
                        remote_address="",
                        service="pppoe",
                        disabled=False
                    )
                    pppoe_created = service.create_pppoe_account(pppoe_account)
                    service.disconnect()
                    
                    if not pppoe_created:
                        pppoe_error = "Failed to create PPPoE account in Mikrotik"
                else:
                    pppoe_error = "Failed to connect to Mikrotik"
            except Exception as e:
                pppoe_error = f"Mikrotik error: {str(e)}"
                logger.error(f"Mikrotik PPPoE creation failed: {e}")
        else:
            pppoe_error = "Mikrotik not configured"
    
    # Save subscriber to database
    sub_dict = subscriber.model_dump()
    sub_dict.pop('activate_pppoe', None)  # Don't store this field
    result = await db.subscribers.insert_one(sub_dict)
    sub_id = str(result.inserted_id)
    
    # Create initial job order for installation
    job = {
        "subscriber_id": sub_id,
        "type": "Installation",
        "description": f"Installation for {subscriber.first_name} {subscriber.last_name}",
        "status": "Open",
        "priority": "High",
        "created_at": datetime.now(timezone.utc)
    }
    await db.job_orders.insert_one(job)
    
    response_data = {
        "message": "Subscriber created successfully",
        "account_number": subscriber.account_number,
        "id": sub_id,
        "pppoe_created": pppoe_created
    }
    
    if pppoe_error:
        response_data["pppoe_error"] = pppoe_error
    
    return response_data

@api_router.get("/subscribers/{account_number}")
async def get_subscriber(account_number: str, current_user: dict = Depends(get_current_user)):
    subscriber = await db.subscribers.find_one({"account_number": account_number}, {"_id": 0})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    return subscriber

@api_router.put("/subscribers/{account_number}")
async def update_subscriber(account_number: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'user']:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.subscribers.update_one({"account_number": account_number}, {"$set": updates})
    return {"message": "Subscriber updated"}

# ========== BILLING & INVOICING ==========
@api_router.post("/invoices/generate")
async def generate_invoices(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscribers = await db.subscribers.find({"is_active": True}).to_list(1000)
    count = 0
    
    for sub in subscribers:
        plan = await db.subscription_plans.find_one({"name": sub.get('plan_id')})
        if plan:
            invoice = {
                "invoice_number": generate_invoice_number(),
                "subscriber_id": sub['account_number'],
                "amount": plan['price'],
                "due_date": datetime.now(timezone.utc) + timedelta(days=30),
                "paid": False,
                "created_at": datetime.now(timezone.utc)
            }
            await db.invoices.insert_one(invoice)
            count += 1
    
    return {"message": f"Generated {count} invoices"}

@api_router.get("/invoices")
async def list_invoices(current_user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(1000)
    return invoices

@api_router.get("/invoices/subscriber/{account_number}")
async def get_subscriber_invoices(account_number: str):
    invoices = await db.invoices.find({"subscriber_id": account_number}, {"_id": 0}).to_list(1000)
    return invoices

# ========== PAYMENTS & CASHIER ==========
@api_router.post("/payments")
async def process_payment(payment: Payment, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    payment_dict = payment.model_dump()
    payment_dict['received_by'] = current_user['username']
    payment_dict['or_number'] = f"OR{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}"
    
    result = await db.payments.insert_one(payment_dict)
    
    # Update invoice
    await db.invoices.update_one(
        {"invoice_number": payment.invoice_id},
        {"$set": {"paid": True, "paid_date": datetime.now(timezone.utc)}}
    )
    
    # Handle advance payment wallet
    if payment.amount > 0:
        invoice = await db.invoices.find_one({"invoice_number": payment.invoice_id})
        if invoice and payment.amount > invoice['amount']:
            excess = payment.amount - invoice['amount']
            await db.wallet_balance.update_one(
                {"subscriber_id": payment.subscriber_id},
                {"$inc": {"balance": excess}},
                upsert=True
            )
    
    return {"message": "Payment processed", "or_number": payment_dict['or_number'], "id": str(result.inserted_id)}

@api_router.get("/payments/subscriber/{account_number}")
async def get_subscriber_payments(account_number: str):
    payments = await db.payments.find({"subscriber_id": account_number}, {"_id": 0}).to_list(1000)
    return payments

@api_router.get("/payments/receipt/{or_number}")
async def generate_receipt(or_number: str):
    payment = await db.payments.find_one({"or_number": or_number}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    subscriber = await db.subscribers.find_one({"account_number": payment['subscriber_id']}, {"_id": 0})
    company = await db.company_settings.find_one({}, {"_id": 0})
    
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    y = height - 1*inch
    p.setFont("Helvetica-Bold", 16)
    if company:
        p.drawString(1*inch, y, company.get('business_name', 'Billing System'))
        y -= 0.3*inch
        p.setFont("Helvetica", 10)
        p.drawString(1*inch, y, company.get('address', ''))
    
    y -= 0.5*inch
    p.setFont("Helvetica-Bold", 14)
    p.drawString(1*inch, y, "OFFICIAL RECEIPT")
    
    y -= 0.4*inch
    p.setFont("Helvetica", 10)
    p.drawString(1*inch, y, f"OR Number: {or_number}")
    y -= 0.25*inch
    p.drawString(1*inch, y, f"Date: {payment['payment_date'].strftime('%Y-%m-%d %H:%M')}")
    
    y -= 0.5*inch
    if subscriber:
        p.drawString(1*inch, y, f"Customer: {subscriber.get('first_name', '')} {subscriber.get('last_name', '')}")
        y -= 0.25*inch
        p.drawString(1*inch, y, f"Account: {payment['subscriber_id']}")
    
    y -= 0.5*inch
    p.drawString(1*inch, y, f"Amount Paid: ₱{payment['amount']:.2f}")
    y -= 0.25*inch
    p.drawString(1*inch, y, f"Mode: {payment['mode']}")
    
    p.showPage()
    p.save()
    buffer.seek(0)
    
    return StreamingResponse(buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=receipt_{or_number}.pdf"
    })

# ========== JOB ORDERS ==========
@api_router.get("/joborders")
async def list_job_orders(current_user: dict = Depends(get_current_user)):
    job_orders = await db.job_orders.find({}, {"_id": 0}).to_list(1000)
    return job_orders

@api_router.post("/joborders")
async def create_job_order(job: JobOrder, current_user: dict = Depends(get_current_user)):
    await db.job_orders.insert_one(job.model_dump())
    return {"message": "Job order created"}

@api_router.put("/joborders/{job_id}")
async def update_job_order(job_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update inventory if materials used
    if 'materials_used' in updates:
        for material in updates['materials_used']:
            await db.inventory.update_one(
                {"name": material['name']},
                {"$inc": {"quantity": -material['quantity']}}
            )
    
    await db.job_orders.update_one({"job_id": job_id}, {"$set": updates})
    return {"message": "Job order updated"}

# ========== INVENTORY ==========
@api_router.get("/inventory")
async def list_inventory(current_user: dict = Depends(get_current_user)):
    items = await db.inventory.find({}, {"_id": 0}).to_list(1000)
    return items

@api_router.post("/inventory")
async def create_inventory_item(item: Inventory, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.inventory.insert_one(item.model_dump())
    return {"message": "Inventory item created"}

@api_router.put("/inventory/{name}")
async def update_inventory(name: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.inventory.update_one({"name": name}, {"$set": updates})
    return {"message": "Inventory updated"}

# ========== EXPENSES ==========
@api_router.get("/expenses")
async def list_expenses(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    expenses = await db.expenses.find({}, {"_id": 0}).to_list(1000)
    return expenses

@api_router.post("/expenses")
async def create_expense(expense: Expense, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.expenses.insert_one(expense.model_dump())
    return {"message": "Expense created"}

# ========== COMPANY SETTINGS ==========
@api_router.get("/settings/company")
async def get_company_settings():
    settings = await db.company_settings.find_one({}, {"_id": 0})
    return settings or {}

@api_router.post("/settings/company")
async def save_company_settings(settings: CompanySettings, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.company_settings.delete_many({})
    await db.company_settings.insert_one(settings.model_dump())
    return {"message": "Company settings saved"}

# ========== DASHBOARD STATS ==========
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    # Calculate stats
    total_subscribers = await db.subscribers.count_documents({"is_active": True})
    total_invoices = await db.invoices.count_documents({})
    unpaid_invoices = await db.invoices.count_documents({"paid": False})
    
    # Gross sales
    payments = await db.payments.find({}).to_list(10000)
    gross_sales = sum(p['amount'] for p in payments)
    
    # Expenses
    expenses = await db.expenses.find({}).to_list(10000)
    total_expenses = sum(e['amount'] for e in expenses)
    
    # Net sales
    net_sales = gross_sales - total_expenses
    
    # Receivables
    unpaid = await db.invoices.find({"paid": False}).to_list(10000)
    receivables = sum(inv['amount'] for inv in unpaid)
    
    # Open tickets
    open_tickets = await db.job_orders.count_documents({"status": "Open"})
    
    return {
        "active_subscribers": total_subscribers,
        "gross_sales": gross_sales,
        "expenses": total_expenses,
        "net_sales": net_sales,
        "receivables": receivables,
        "open_tickets": open_tickets,
        "total_invoices": total_invoices,
        "unpaid_invoices": unpaid_invoices
    }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    # Create default admin user
    existing_admin = await db.users.find_one({"username": "admin"})
    if not existing_admin:
        admin_user = {
            "username": "admin",
            "full_name": "Administrator",
            "role": "admin",
            "password": hash_password("@Gello1006"),
            "is_active": True,
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(admin_user)
        logger.info("Default admin user created")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()