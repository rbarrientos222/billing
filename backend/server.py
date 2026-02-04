from fastapi import FastAPI, APIRouter, Depends, HTTPException
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
import calendar
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import asyncio

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

# Scheduler for automatic billing
scheduler = AsyncIOScheduler()

# ========== AUTOMATIC BILLING FUNCTIONS ==========
async def auto_generate_billing():
    """
    Automatic billing function that runs daily.
    Generates invoices for subscribers whose billing day matches today.
    """
    today = datetime.now(timezone.utc)
    current_day = today.day
    last_day_of_month = calendar.monthrange(today.year, today.month)[1]
    
    logger.info(f"Running automatic billing check for day {current_day}")
    
    # Get all active subscribers
    subscribers = await db.subscribers.find({"is_active": True}).to_list(10000)
    invoices_generated = 0
    
    for sub in subscribers:
        billing_period = sub.get('billing_period', '30th')
        
        # Determine billing day
        if billing_period == "15th":
            billing_day = 15
        elif billing_period == "30th":
            # For months with less than 30 days, use the last day
            billing_day = min(30, last_day_of_month)
        else:
            billing_day = 30
        
        # Check if today is the billing day
        if current_day == billing_day:
            # Check if invoice already exists for this billing cycle
            start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            existing_invoice = await db.invoices.find_one({
                "subscriber_id": sub['account_number'],
                "created_at": {"$gte": start_of_month},
                "is_prorated": {"$ne": True}  # Exclude prorated invoices
            })
            
            if not existing_invoice:
                # Get subscriber's plan
                plan = await db.subscription_plans.find_one({"name": sub.get('plan_id')})
                if plan:
                    # Calculate due date (usually 15 days after billing)
                    due_date = today + timedelta(days=15)
                    
                    invoice = {
                        "invoice_number": f"INV{today.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
                        "subscriber_id": sub['account_number'],
                        "subscriber_name": f"{sub.get('first_name', '')} {sub.get('last_name', '')}".strip(),
                        "plan_name": plan['name'],
                        "amount": plan['price'],
                        "billing_period": billing_period,
                        "due_date": due_date,
                        "paid": False,
                        "is_prorated": False,
                        "created_at": today
                    }
                    await db.invoices.insert_one(invoice)
                    invoices_generated += 1
                    logger.info(f"Generated invoice {invoice['invoice_number']} for {sub['account_number']}")
    
    logger.info(f"Automatic billing completed. Generated {invoices_generated} invoices.")
    
    # Log billing run
    await db.billing_logs.insert_one({
        "run_date": today,
        "invoices_generated": invoices_generated,
        "status": "completed"
    })
    
    return invoices_generated

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
    street: Optional[str] = None
    barangay: Optional[str] = None
    municipality: Optional[str] = None
    province: Optional[str] = None
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

def calculate_prorated_amount(monthly_rate: float, billing_period: str, installation_date: datetime) -> float:
    """Calculate prorated bill based on installation date and billing period"""
    now = installation_date
    
    # Determine billing cutoff day
    if billing_period == "15th":
        cutoff_day = 15
    elif billing_period == "30th":
        cutoff_day = 30  # or last day of month
    else:
        cutoff_day = 30  # default
    
    # Get current month's last day
    if cutoff_day == 30:
        import calendar
        last_day = calendar.monthrange(now.year, now.month)[1]
        cutoff_day = last_day
    
    # Calculate days remaining in current billing cycle
    days_in_month = cutoff_day
    days_remaining = cutoff_day - now.day + 1  # including installation day
    
    if days_remaining <= 0:
        # If installed after cutoff, bill for next cycle
        return 0
    
    # Calculate prorated amount
    prorated = (monthly_rate / days_in_month) * days_remaining
    return round(prorated, 2)

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
    
    def get_active_clients(self) -> int:
        try:
            resource = self.api.get_resource('/ppp/active')
            active = resource.get()
            return len(active) if active else 0
        except Exception as e:
            logger.error(f"Failed to get active clients: {e}")
            return 0

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
        active_clients = service.get_active_clients()
        service.disconnect()
        stats['active_clients'] = active_clients
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

@api_router.get("/addresses/provinces")
async def get_provinces():
    import json
    from pathlib import Path
    
    addresses_file = Path(__file__).parent / 'ph_addresses.json'
    with open(addresses_file, 'r') as f:
        data = json.load(f)
    
    return {"provinces": [p["name"] for p in data["provinces"]]}

@api_router.get("/addresses/municipalities/{province}")
async def get_municipalities(province: str):
    import json
    from pathlib import Path
    
    addresses_file = Path(__file__).parent / 'ph_addresses.json'
    with open(addresses_file, 'r') as f:
        data = json.load(f)
    
    for prov in data["provinces"]:
        if prov["name"] == province:
            return {"municipalities": [m["name"] for m in prov["municipalities"]]}
    
    return {"municipalities": []}

@api_router.get("/addresses/barangays/{province}/{municipality}")
async def get_barangays(province: str, municipality: str):
    import json
    from pathlib import Path
    
    addresses_file = Path(__file__).parent / 'ph_addresses.json'
    with open(addresses_file, 'r') as f:
        data = json.load(f)
    
    for prov in data["provinces"]:
        if prov["name"] == province:
            for muni in prov["municipalities"]:
                if muni["name"] == municipality:
                    return {"barangays": muni["barangays"]}
    
    return {"barangays": []}

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
    
    # Generate prorated invoice if plan is assigned
    prorated_invoice = None
    if subscriber.plan_id:
        plan = await db.subscription_plans.find_one({"name": subscriber.plan_id})
        if plan:
            installation_date = subscriber.installation_date or datetime.now(timezone.utc)
            prorated_amount = calculate_prorated_amount(
                plan['price'], 
                subscriber.billing_period, 
                installation_date
            )
            
            if prorated_amount > 0:
                # Determine due date based on billing period
                if subscriber.billing_period == "15th":
                    due_day = 15
                elif subscriber.billing_period == "30th":
                    import calendar
                    due_day = calendar.monthrange(installation_date.year, installation_date.month)[1]
                else:
                    due_day = 30
                
                due_date = installation_date.replace(day=due_day)
                if due_date <= installation_date:
                    # If due date already passed, set to next month
                    if installation_date.month == 12:
                        due_date = due_date.replace(year=installation_date.year + 1, month=1)
                    else:
                        due_date = due_date.replace(month=installation_date.month + 1)
                
                prorated_invoice = {
                    "invoice_number": generate_invoice_number(),
                    "subscriber_id": subscriber.account_number,
                    "amount": prorated_amount,
                    "due_date": due_date,
                    "paid": False,
                    "is_prorated": True,
                    "created_at": datetime.now(timezone.utc)
                }
                await db.invoices.insert_one(prorated_invoice)
    
    response_data = {
        "message": "Subscriber created successfully",
        "account_number": subscriber.account_number,
        "id": sub_id,
        "pppoe_created": pppoe_created
    }
    
    if prorated_invoice:
        response_data["prorated_invoice"] = {
            "invoice_number": prorated_invoice["invoice_number"],
            "amount": prorated_invoice["amount"],
            "due_date": prorated_invoice["due_date"].isoformat()
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

# ========== BILLING CYCLE MANAGEMENT ==========
@api_router.get("/billing/status")
async def get_billing_status(current_user: dict = Depends(get_current_user)):
    """Get the status of automatic billing"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get last billing log
    last_log = await db.billing_logs.find_one({}, {"_id": 0}, sort=[("run_date", -1)])
    
    # Get billing settings
    settings = await db.billing_settings.find_one({}, {"_id": 0})
    
    # Count pending invoices
    pending_count = await db.invoices.count_documents({"paid": False})
    
    today = datetime.now(timezone.utc)
    
    return {
        "scheduler_running": scheduler.running,
        "last_run": last_log,
        "settings": settings or {"auto_billing_enabled": True, "billing_time": "00:01"},
        "pending_invoices": pending_count,
        "current_day": today.day,
        "next_15th_billing": "Active" if today.day < 15 else "Completed for this month",
        "next_30th_billing": "Active" if today.day < 30 else "Completed for this month"
    }

@api_router.post("/billing/settings")
async def update_billing_settings(settings: dict, current_user: dict = Depends(get_current_user)):
    """Update automatic billing settings"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.billing_settings.delete_many({})
    settings['updated_at'] = datetime.now(timezone.utc)
    settings['updated_by'] = current_user['username']
    await db.billing_settings.insert_one(settings)
    
    return {"message": "Billing settings updated"}

@api_router.post("/billing/run-now")
async def run_billing_now(current_user: dict = Depends(get_current_user)):
    """Manually trigger billing generation (for testing or catch-up)"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    invoices_generated = await auto_generate_billing()
    return {"message": f"Billing run completed. Generated {invoices_generated} invoices."}

@api_router.get("/billing/logs")
async def get_billing_logs(current_user: dict = Depends(get_current_user)):
    """Get billing run history"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    logs = await db.billing_logs.find({}, {"_id": 0}).sort("run_date", -1).to_list(100)
    return logs

@api_router.get("/billing/upcoming")
async def get_upcoming_billing(current_user: dict = Depends(get_current_user)):
    """Get subscribers with upcoming billing"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    today = datetime.now(timezone.utc)
    current_day = today.day
    
    subscribers_15th = await db.subscribers.find(
        {"is_active": True, "billing_period": "15th"}, 
        {"_id": 0, "account_number": 1, "first_name": 1, "last_name": 1, "plan_id": 1}
    ).to_list(1000)
    
    subscribers_30th = await db.subscribers.find(
        {"is_active": True, "billing_period": "30th"},
        {"_id": 0, "account_number": 1, "first_name": 1, "last_name": 1, "plan_id": 1}
    ).to_list(1000)
    
    return {
        "billing_15th": {
            "count": len(subscribers_15th),
            "days_until": (15 - current_day) if current_day < 15 else (15 + (calendar.monthrange(today.year, today.month)[1] - current_day)),
            "subscribers": subscribers_15th[:10]  # Return first 10 for preview
        },
        "billing_30th": {
            "count": len(subscribers_30th),
            "days_until": (30 - current_day) if current_day < 30 else 0,
            "subscribers": subscribers_30th[:10]
        }
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
    
    # Start the scheduler for automatic billing
    try:
        # Get billing settings
        settings = await db.billing_settings.find_one({})
        billing_enabled = settings.get('auto_billing_enabled', True) if settings else True
        billing_time = settings.get('billing_time', '00:01') if settings else '00:01'
        
        if billing_enabled:
            # Parse time (format: "HH:MM")
            hour, minute = map(int, billing_time.split(':'))
            
            # Schedule daily billing at specified time
            scheduler.add_job(
                auto_generate_billing,
                CronTrigger(hour=hour, minute=minute),
                id='daily_billing',
                replace_existing=True
            )
            
            scheduler.start()
            logger.info(f"Automatic billing scheduler started - runs daily at {billing_time}")
        else:
            logger.info("Automatic billing is disabled")
    except Exception as e:
        logger.error(f"Failed to start billing scheduler: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    # Shutdown scheduler
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Billing scheduler stopped")
    
    # Close database connection
    client.close()