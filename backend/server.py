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
                    
                    # Get billing period description
                    period_info = get_billing_period_description(billing_period, today)
                    
                    invoice = {
                        "invoice_number": f"INV{today.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
                        "subscriber_id": sub['account_number'],
                        "subscriber_name": f"{sub.get('first_name', '')} {sub.get('last_name', '')}".strip(),
                        "plan_name": plan['name'],
                        "amount": plan['price'],
                        "description": period_info['description'],
                        "billing_period": billing_period,
                        "billing_start": period_info['start_date'],
                        "billing_end": period_info['end_date'],
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
    generate_prorated_bill: bool = True  # If False, wait for next billing cycle
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

def get_billing_period_description(billing_period: str, reference_date: datetime = None) -> dict:
    """
    Generate billing period description based on billing day (15th or 30th).
    Returns start date, end date, and formatted description.
    """
    if reference_date is None:
        reference_date = datetime.now(timezone.utc)
    
    billing_day = 15 if billing_period == "15th" else 30
    current_day = reference_date.day
    current_month = reference_date.month
    current_year = reference_date.year
    
    # Determine the billing cycle dates
    if billing_day == 15:
        if current_day <= 15:
            # Current cycle: prev month 16 - current month 15
            if current_month == 1:
                start_date = reference_date.replace(year=current_year-1, month=12, day=16)
            else:
                start_date = reference_date.replace(month=current_month-1, day=16)
            end_date = reference_date.replace(day=15)
        else:
            # Current cycle: current month 16 - next month 15
            start_date = reference_date.replace(day=16)
            if current_month == 12:
                end_date = reference_date.replace(year=current_year+1, month=1, day=15)
            else:
                end_date = reference_date.replace(month=current_month+1, day=15)
    else:  # 30th billing
        last_day = calendar.monthrange(current_year, current_month)[1]
        actual_billing_day = min(30, last_day)
        
        if current_day <= actual_billing_day:
            # Current cycle: prev month (last day+1 or 1) - current month billing day
            if current_month == 1:
                prev_last_day = calendar.monthrange(current_year-1, 12)[1]
                prev_billing_day = min(30, prev_last_day)
                start_date = reference_date.replace(year=current_year-1, month=12, day=prev_billing_day) + timedelta(days=1)
            else:
                prev_last_day = calendar.monthrange(current_year, current_month-1)[1]
                prev_billing_day = min(30, prev_last_day)
                start_date = reference_date.replace(month=current_month-1, day=prev_billing_day) + timedelta(days=1)
            end_date = reference_date.replace(day=actual_billing_day)
        else:
            # Current cycle: current month (billing day+1) - next month billing day
            start_date = reference_date.replace(day=actual_billing_day) + timedelta(days=1)
            if current_month == 12:
                next_last_day = calendar.monthrange(current_year+1, 1)[1]
                next_billing_day = min(30, next_last_day)
                end_date = reference_date.replace(year=current_year+1, month=1, day=next_billing_day)
            else:
                next_last_day = calendar.monthrange(current_year, current_month+1)[1]
                next_billing_day = min(30, next_last_day)
                end_date = reference_date.replace(month=current_month+1, day=next_billing_day)
    
    # Format the description
    start_str = start_date.strftime("%B %d, %Y")
    end_str = end_date.strftime("%B %d, %Y")
    description = f"Bill for billing period {start_str} - {end_str}"
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "description": description
    }

def calculate_prorated_amount(monthly_rate: float, billing_period: str, installation_date: datetime) -> dict:
    """
    Calculate prorated bill based on installation date and billing period.
    
    Logic:
    - If billing_period is "15th": Calculate from today until the 15th
    - If billing_period is "30th": Calculate from today until the 30th (or last day of month if month has fewer days)
    
    Returns dict with amount and calculation details
    """
    now = installation_date
    current_day = now.day
    
    # Determine billing cutoff day
    if billing_period == "15th":
        billing_day = 15
    else:  # "30th" or default
        billing_day = 30
    
    # Get last day of current month
    last_day_of_month = calendar.monthrange(now.year, now.month)[1]
    
    # Adjust billing day if it exceeds month's days (e.g., Feb 28/29)
    actual_billing_day = min(billing_day, last_day_of_month)
    
    # Calculate days remaining until billing day
    if current_day <= actual_billing_day:
        # Billing day is in current month
        days_remaining = actual_billing_day - current_day + 1  # +1 includes installation day
        days_in_period = actual_billing_day
    else:
        # Billing day already passed, calculate for next month's cycle
        # Days remaining in current month + days until billing day in next month
        if billing_period == "15th":
            next_billing_day = 15
        else:
            # Get last day of next month for 30th billing
            next_month = now.month + 1 if now.month < 12 else 1
            next_year = now.year if now.month < 12 else now.year + 1
            next_month_last_day = calendar.monthrange(next_year, next_month)[1]
            next_billing_day = min(30, next_month_last_day)
        
        days_remaining = (last_day_of_month - current_day + 1) + next_billing_day
        days_in_period = last_day_of_month  # Use current month days for calculation
    
    # Calculate daily rate and prorated amount
    daily_rate = monthly_rate / 30  # Standard 30-day month for rate calculation
    prorated_amount = daily_rate * days_remaining
    
    return {
        "amount": round(prorated_amount, 2),
        "days_remaining": days_remaining,
        "billing_day": actual_billing_day,
        "daily_rate": round(daily_rate, 2),
        "calculation": f"{days_remaining} days × ₱{round(daily_rate, 2)}/day = ₱{round(prorated_amount, 2)}"
    }

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

@api_router.post("/mikrotik/test-connection")
async def test_mikrotik_connection(test_config: dict, current_user: dict = Depends(get_current_user)):
    """
    Test Mikrotik connection without saving the configuration.
    Can test with provided credentials or use saved config.
    """
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    import socket
    import time
    
    # Get config to test - either from request or from database
    if test_config.get('ip_address') and test_config.get('username'):
        # Use provided config
        config = test_config
        # If password not provided, get from saved config
        if not config.get('password'):
            saved_config = await db.mikrotik_configs.find_one({})
            if saved_config:
                config['password'] = saved_config.get('password')
            else:
                return {
                    "success": False,
                    "step": "validation",
                    "error": "Password required for new configuration"
                }
        else:
            # Encrypt the password for the test
            config['password'] = encrypt_password(config['password'])
    else:
        # Use saved config
        config = await db.mikrotik_configs.find_one({})
        if not config:
            return {
                "success": False,
                "step": "validation",
                "error": "No Mikrotik configuration found. Please enter credentials."
            }
    
    results = {
        "success": False,
        "steps": [],
        "router_info": None
    }
    
    # Step 1: DNS Resolution
    try:
        ip_address = config.get('ip_address', '')
        # Remove port if accidentally included in IP
        if ':' in ip_address:
            ip_address = ip_address.split(':')[0]
        
        start_time = time.time()
        resolved_ip = socket.gethostbyname(ip_address)
        dns_time = round((time.time() - start_time) * 1000, 2)
        results["steps"].append({
            "step": "DNS Resolution",
            "status": "success",
            "message": f"Resolved {ip_address} to {resolved_ip}",
            "time_ms": dns_time
        })
    except socket.gaierror as e:
        results["steps"].append({
            "step": "DNS Resolution",
            "status": "failed",
            "message": f"Cannot resolve hostname: {ip_address}",
            "error": str(e)
        })
        return results
    
    # Step 2: Port Connectivity
    port = config.get('port', 8728)
    try:
        start_time = time.time()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        result = sock.connect_ex((resolved_ip, port))
        port_time = round((time.time() - start_time) * 1000, 2)
        sock.close()
        
        if result == 0:
            results["steps"].append({
                "step": "Port Connectivity",
                "status": "success",
                "message": f"Port {port} is open on {resolved_ip}",
                "time_ms": port_time
            })
        else:
            results["steps"].append({
                "step": "Port Connectivity",
                "status": "failed",
                "message": f"Port {port} is closed or filtered",
                "error": f"Connection failed with error code {result}"
            })
            return results
    except socket.timeout:
        results["steps"].append({
            "step": "Port Connectivity",
            "status": "failed",
            "message": f"Connection to port {port} timed out",
            "error": "Timeout after 10 seconds"
        })
        return results
    except Exception as e:
        results["steps"].append({
            "step": "Port Connectivity",
            "status": "failed",
            "message": f"Failed to connect to port {port}",
            "error": str(e)
        })
        return results
    
    # Step 3: API Authentication
    try:
        start_time = time.time()
        service = MikrotikService(config)
        if service.connect():
            auth_time = round((time.time() - start_time) * 1000, 2)
            results["steps"].append({
                "step": "API Authentication",
                "status": "success",
                "message": "Successfully authenticated with Mikrotik API",
                "time_ms": auth_time
            })
            
            # Step 4: Get Router Info
            try:
                stats = service.get_resource_stats()
                active_clients = service.get_active_clients()
                results["steps"].append({
                    "step": "Router Info",
                    "status": "success",
                    "message": "Successfully retrieved router information"
                })
                results["router_info"] = {
                    "cpu_load": stats.get('cpu_load'),
                    "free_memory": stats.get('free_memory'),
                    "total_memory": stats.get('total_memory'),
                    "uptime": stats.get('uptime'),
                    "version": stats.get('version'),
                    "board_name": stats.get('board_name'),
                    "active_clients": active_clients
                }
                results["success"] = True
            except Exception as e:
                results["steps"].append({
                    "step": "Router Info",
                    "status": "warning",
                    "message": "Connected but failed to get router info",
                    "error": str(e)
                })
                results["success"] = True  # Connection still successful
            
            service.disconnect()
        else:
            results["steps"].append({
                "step": "API Authentication",
                "status": "failed",
                "message": "Failed to authenticate with Mikrotik API",
                "error": "Check username/password and ensure API service is enabled"
            })
    except Exception as e:
        results["steps"].append({
            "step": "API Authentication",
            "status": "failed",
            "message": "API connection failed",
            "error": str(e)
        })
    
    return results

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
    sub_dict.pop('generate_prorated_bill', None)  # Don't store this field, just use for invoice decision
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
    
    # Generate prorated invoice if plan is assigned AND generate_prorated_bill is True
    prorated_invoice = None
    prorated_details = None
    
    if subscriber.plan_id and subscriber.generate_prorated_bill:
        plan = await db.subscription_plans.find_one({"name": subscriber.plan_id})
        if plan:
            installation_date = subscriber.installation_date or datetime.now(timezone.utc)
            prorate_calc = calculate_prorated_amount(
                plan['price'], 
                subscriber.billing_period, 
                installation_date
            )
            prorated_amount = prorate_calc['amount']
            prorated_details = prorate_calc
            
            if prorated_amount > 0:
                # Determine due date based on billing period
                if subscriber.billing_period == "15th":
                    due_day = 15
                else:  # "30th"
                    due_day = min(30, calendar.monthrange(installation_date.year, installation_date.month)[1])
                
                due_date = installation_date.replace(day=due_day)
                if due_date <= installation_date:
                    # If due date already passed, set to next month
                    if installation_date.month == 12:
                        due_date = due_date.replace(year=installation_date.year + 1, month=1)
                    else:
                        due_date = due_date.replace(month=installation_date.month + 1)
                
                # Generate description for prorated bill
                start_date_str = installation_date.strftime("%B %d, %Y")
                end_date_str = due_date.strftime("%B %d, %Y")
                description = f"Prorated bill for period {start_date_str} - {end_date_str}"
                
                prorated_invoice = {
                    "invoice_number": generate_invoice_number(),
                    "subscriber_id": subscriber.account_number,
                    "subscriber_name": f"{subscriber.first_name} {subscriber.last_name}",
                    "plan_name": plan['name'],
                    "amount": prorated_amount,
                    "description": description,
                    "billing_start": installation_date,
                    "billing_end": due_date,
                    "due_date": due_date,
                    "paid": False,
                    "is_prorated": True,
                    "billing_period": subscriber.billing_period,
                    "calculation_details": prorate_calc['calculation'],
                    "created_at": datetime.now(timezone.utc)
                }
                await db.invoices.insert_one(prorated_invoice)
    
    response_data = {
        "message": "Subscriber created successfully",
        "account_number": subscriber.account_number,
        "id": sub_id,
        "pppoe_created": pppoe_created,
        "prorated_bill_generated": subscriber.generate_prorated_bill
    }
    
    if prorated_invoice:
        response_data["prorated_invoice"] = {
            "invoice_number": prorated_invoice["invoice_number"],
            "amount": prorated_invoice["amount"],
            "due_date": prorated_invoice["due_date"].isoformat(),
            "calculation": prorated_details['calculation'] if prorated_details else None,
            "days_covered": prorated_details['days_remaining'] if prorated_details else None
        }
    elif not subscriber.generate_prorated_bill:
        response_data["billing_note"] = f"No prorated bill generated. First invoice will be on the {subscriber.billing_period}."
    
    if pppoe_error:
        response_data["pppoe_error"] = pppoe_error
    
    return response_data

@api_router.get("/subscribers/search")
async def search_subscribers(q: str, current_user: dict = Depends(get_current_user)):
    """
    Search subscribers by name, account number, or phone.
    """
    if not q or len(q) < 2:
        return []
    
    # Search by first name, last name, or account number (case-insensitive)
    query = {
        "$or": [
            {"first_name": {"$regex": q, "$options": "i"}},
            {"last_name": {"$regex": q, "$options": "i"}},
            {"account_number": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"pppoe_username": {"$regex": q, "$options": "i"}}
        ]
    }
    
    subscribers = await db.subscribers.find(query, {"_id": 0}).limit(20).to_list(20)
    return subscribers

@api_router.get("/subscribers/{account_number}")
async def get_subscriber(account_number: str, current_user: dict = Depends(get_current_user)):
    subscriber = await db.subscribers.find_one({"account_number": account_number}, {"_id": 0})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    return subscriber

@api_router.get("/payments/today-stats")
async def get_today_payment_stats(current_user: dict = Depends(get_current_user)):
    """
    Get payment statistics for today.
    """
    if current_user['role'] not in ['admin', 'cashier', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get start of today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Count and sum today's payments
    pipeline = [
        {"$match": {"payment_date": {"$gte": today_start}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1}
        }}
    ]
    
    result = await db.payments.aggregate(pipeline).to_list(1)
    
    if result:
        return {
            "total": result[0]['total'],
            "count": result[0]['count'],
            "date": today_start.strftime("%Y-%m-%d")
        }
    else:
        return {
            "total": 0,
            "count": 0,
            "date": today_start.strftime("%Y-%m-%d")
        }

@api_router.post("/billing/preview-prorated")
async def preview_prorated_bill(data: dict, current_user: dict = Depends(get_current_user)):
    """
    Preview prorated bill calculation before creating subscriber.
    
    Request body:
    {
        "plan_id": "Basic Plan",
        "billing_period": "15th" or "30th",
        "installation_date": "2026-02-04" (optional, defaults to today)
    }
    """
    if current_user['role'] not in ['admin', 'billing', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    plan = await db.subscription_plans.find_one({"name": data.get('plan_id')})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    installation_date = datetime.now(timezone.utc)
    if data.get('installation_date'):
        try:
            installation_date = datetime.fromisoformat(data['installation_date'].replace('Z', '+00:00'))
        except:
            pass
    
    billing_period = data.get('billing_period', '30th')
    
    prorate_calc = calculate_prorated_amount(
        plan['price'],
        billing_period,
        installation_date
    )
    
    # Calculate due date
    if billing_period == "15th":
        due_day = 15
    else:
        due_day = min(30, calendar.monthrange(installation_date.year, installation_date.month)[1])
    
    due_date = installation_date.replace(day=due_day)
    if due_date <= installation_date:
        if installation_date.month == 12:
            due_date = due_date.replace(year=installation_date.year + 1, month=1)
        else:
            due_date = due_date.replace(month=installation_date.month + 1)
    
    return {
        "plan_name": plan['name'],
        "monthly_rate": plan['price'],
        "billing_period": billing_period,
        "installation_date": installation_date.strftime("%Y-%m-%d"),
        "prorated_amount": prorate_calc['amount'],
        "days_covered": prorate_calc['days_remaining'],
        "daily_rate": prorate_calc['daily_rate'],
        "calculation": prorate_calc['calculation'],
        "due_date": due_date.strftime("%Y-%m-%d"),
        "billing_day": prorate_calc['billing_day']
    }

@api_router.put("/subscribers/{account_number}")
async def update_subscriber(account_number: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'user']:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.subscribers.update_one({"account_number": account_number}, {"$set": updates})
    return {"message": "Subscriber updated"}

# ========== SUBSCRIBER PLAN MANAGEMENT ==========
@api_router.post("/subscribers/{account_number}/change-plan")
async def change_subscriber_plan(account_number: str, data: dict, current_user: dict = Depends(get_current_user)):
    """
    Change subscriber's plan and PPPoE profile.
    Calculates prorated bill for the remaining billing period.
    """
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    new_plan_id = data.get('new_plan_id')
    new_pppoe_profile = data.get('new_pppoe_profile')
    generate_prorated = data.get('generate_prorated_bill', True)
    
    if not new_plan_id:
        raise HTTPException(status_code=400, detail="New plan ID required")
    
    new_plan = await db.subscription_plans.find_one({"name": new_plan_id})
    if not new_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    old_plan_id = subscriber.get('plan_id')
    old_plan = await db.subscription_plans.find_one({"name": old_plan_id}) if old_plan_id else None
    
    now = datetime.now(timezone.utc)
    response = {
        "message": "Plan changed successfully",
        "old_plan": old_plan_id,
        "new_plan": new_plan_id
    }
    
    # Calculate prorated adjustment if requested
    if generate_prorated and old_plan:
        billing_period = subscriber.get('billing_period', '30th')
        
        # Calculate days remaining in billing period
        prorate_calc = calculate_prorated_amount(
            new_plan['price'] - old_plan['price'],  # Price difference
            billing_period,
            now
        )
        
        if prorate_calc['amount'] != 0:
            invoice_type = "Plan Upgrade" if prorate_calc['amount'] > 0 else "Plan Downgrade Credit"
            
            # Generate description for plan change
            period_info = get_billing_period_description(billing_period, now)
            description = f"{invoice_type}: {old_plan_id} to {new_plan_id} - {period_info['description']}"
            
            invoice = {
                "invoice_number": generate_invoice_number(),
                "subscriber_id": account_number,
                "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip(),
                "plan_name": f"{old_plan_id} → {new_plan_id}",
                "amount": abs(prorate_calc['amount']),
                "description": description,
                "type": invoice_type,
                "billing_start": period_info['start_date'],
                "billing_end": period_info['end_date'],
                "due_date": now + timedelta(days=15),
                "paid": False,
                "is_prorated": True,
                "calculation_details": prorate_calc['calculation'],
                "created_at": now
            }
            await db.invoices.insert_one(invoice)
            response["prorated_invoice"] = {
                "invoice_number": invoice["invoice_number"],
                "amount": invoice["amount"],
                "type": invoice_type
            }
    
    # Update subscriber's plan
    update_data = {
        "plan_id": new_plan_id,
        "plan_changed_at": now,
        "previous_plan": old_plan_id
    }
    
    # Update PPPoE profile on Mikrotik if provided
    if new_pppoe_profile:
        update_data["pppoe_profile"] = new_pppoe_profile
        
        # Update on Mikrotik
        mikrotik_config = await db.mikrotik_configs.find_one({})
        if mikrotik_config and subscriber.get('pppoe_username'):
            try:
                service = MikrotikService(mikrotik_config)
                if service.connect():
                    resource = service.api.get_resource('/ppp/secret')
                    secrets = resource.get(name=subscriber['pppoe_username'])
                    if secrets:
                        resource.set(id=secrets[0]['id'], profile=new_pppoe_profile)
                        response["mikrotik_updated"] = True
                    service.disconnect()
            except Exception as e:
                logger.error(f"Failed to update Mikrotik profile: {e}")
                response["mikrotik_error"] = str(e)
    
    await db.subscribers.update_one(
        {"account_number": account_number},
        {"$set": update_data}
    )
    
    # Log the change
    await db.activity_logs.insert_one({
        "type": "plan_change",
        "subscriber_id": account_number,
        "old_plan": old_plan_id,
        "new_plan": new_plan_id,
        "changed_by": current_user['username'],
        "timestamp": now
    })
    
    return response

@api_router.post("/subscribers/{account_number}/deactivate")
async def deactivate_subscriber(account_number: str, data: dict, current_user: dict = Depends(get_current_user)):
    """
    Deactivate a subscriber.
    - Changes PPPoE profile to non-internet profile
    - Calculates prorated bill from billing cycle start to disconnection date
    - Sets account status to deactivated
    """
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    if not subscriber.get('is_active', True):
        raise HTTPException(status_code=400, detail="Subscriber is already deactivated")
    
    disconnection_profile = data.get('disconnection_profile', 'NON-PAYMENTS')
    reason = data.get('reason', 'Deactivated by admin')
    generate_final_bill = data.get('generate_final_bill', True)
    
    now = datetime.now(timezone.utc)
    response = {
        "message": "Subscriber deactivated successfully",
        "account_number": account_number,
        "deactivation_date": now.isoformat()
    }
    
    # Calculate final prorated bill (from billing cycle start to disconnection date)
    if generate_final_bill:
        plan = await db.subscription_plans.find_one({"name": subscriber.get('plan_id')})
        if plan:
            billing_period = subscriber.get('billing_period', '30th')
            billing_day = 15 if billing_period == "15th" else 30
            
            # Calculate days from billing cycle start to today
            current_day = now.day
            if current_day >= billing_day:
                days_used = current_day - billing_day
            else:
                # Previous billing cycle
                days_used = current_day + (30 - billing_day)
            
            daily_rate = plan['price'] / 30
            final_amount = round(daily_rate * days_used, 2)
            
            if final_amount > 0:
                # Generate description for final bill
                period_info = get_billing_period_description(billing_period, now)
                start_str = period_info['start_date'].strftime("%B %d, %Y")
                end_str = now.strftime("%B %d, %Y")
                description = f"Final bill for period {start_str} - {end_str} (Disconnection)"
                
                invoice = {
                    "invoice_number": generate_invoice_number(),
                    "subscriber_id": account_number,
                    "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip(),
                    "plan_name": subscriber.get('plan_id'),
                    "amount": final_amount,
                    "description": description,
                    "type": "Final Bill - Disconnection",
                    "billing_start": period_info['start_date'],
                    "billing_end": now,
                    "due_date": now + timedelta(days=15),
                    "paid": False,
                    "is_prorated": True,
                    "calculation_details": f"{days_used} days × ₱{round(daily_rate, 2)}/day = ₱{final_amount}",
                    "created_at": now
                }
                await db.invoices.insert_one(invoice)
                response["final_invoice"] = {
                    "invoice_number": invoice["invoice_number"],
                    "amount": final_amount,
                    "days_charged": days_used
                }
    
    # Update PPPoE profile on Mikrotik to disconnection profile
    mikrotik_config = await db.mikrotik_configs.find_one({})
    if mikrotik_config and subscriber.get('pppoe_username'):
        try:
            service = MikrotikService(mikrotik_config)
            if service.connect():
                resource = service.api.get_resource('/ppp/secret')
                secrets = resource.get(name=subscriber['pppoe_username'])
                if secrets:
                    resource.set(id=secrets[0]['id'], profile=disconnection_profile)
                    response["mikrotik_profile_changed"] = disconnection_profile
                service.disconnect()
        except Exception as e:
            logger.error(f"Failed to update Mikrotik profile: {e}")
            response["mikrotik_error"] = str(e)
    
    # Update subscriber status
    await db.subscribers.update_one(
        {"account_number": account_number},
        {"$set": {
            "is_active": False,
            "deactivated_at": now,
            "deactivation_reason": reason,
            "previous_pppoe_profile": subscriber.get('pppoe_profile'),
            "pppoe_profile": disconnection_profile
        }}
    )
    
    # Log the deactivation
    await db.activity_logs.insert_one({
        "type": "deactivation",
        "subscriber_id": account_number,
        "reason": reason,
        "deactivated_by": current_user['username'],
        "timestamp": now
    })
    
    return response

@api_router.post("/subscribers/{account_number}/reactivate")
async def reactivate_subscriber(account_number: str, data: dict, current_user: dict = Depends(get_current_user)):
    """
    Reactivate a deactivated subscriber.
    - Changes PPPoE profile to selected active profile
    - Calculates prorated bill from reactivation date to billing period end
    """
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    if subscriber.get('is_active', True):
        raise HTTPException(status_code=400, detail="Subscriber is already active")
    
    new_profile = data.get('pppoe_profile')
    new_plan_id = data.get('plan_id', subscriber.get('plan_id'))
    generate_prorated = data.get('generate_prorated_bill', True)
    
    if not new_profile:
        raise HTTPException(status_code=400, detail="PPPoE profile required")
    
    now = datetime.now(timezone.utc)
    response = {
        "message": "Subscriber reactivated successfully",
        "account_number": account_number,
        "reactivation_date": now.isoformat()
    }
    
    # Calculate prorated bill from reactivation to billing period end
    if generate_prorated:
        plan = await db.subscription_plans.find_one({"name": new_plan_id})
        if plan:
            prorate_calc = calculate_prorated_amount(
                plan['price'],
                subscriber.get('billing_period', '30th'),
                now
            )
            
            if prorate_calc['amount'] > 0:
                # Generate description for reactivation bill
                billing_period = subscriber.get('billing_period', '30th')
                period_info = get_billing_period_description(billing_period, now)
                start_str = now.strftime("%B %d, %Y")
                end_str = period_info['end_date'].strftime("%B %d, %Y")
                description = f"Reactivation bill for period {start_str} - {end_str}"
                
                invoice = {
                    "invoice_number": generate_invoice_number(),
                    "subscriber_id": account_number,
                    "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip(),
                    "plan_name": new_plan_id,
                    "amount": prorate_calc['amount'],
                    "description": description,
                    "type": "Reactivation - Prorated",
                    "billing_start": now,
                    "billing_end": period_info['end_date'],
                    "due_date": now + timedelta(days=15),
                    "paid": False,
                    "is_prorated": True,
                    "calculation_details": prorate_calc['calculation'],
                    "created_at": now
                }
                await db.invoices.insert_one(invoice)
                response["prorated_invoice"] = {
                    "invoice_number": invoice["invoice_number"],
                    "amount": prorate_calc['amount'],
                    "days_covered": prorate_calc['days_remaining']
                }
    
    # Update PPPoE profile on Mikrotik
    mikrotik_config = await db.mikrotik_configs.find_one({})
    if mikrotik_config and subscriber.get('pppoe_username'):
        try:
            service = MikrotikService(mikrotik_config)
            if service.connect():
                resource = service.api.get_resource('/ppp/secret')
                secrets = resource.get(name=subscriber['pppoe_username'])
                if secrets:
                    resource.set(id=secrets[0]['id'], profile=new_profile)
                    response["mikrotik_profile_changed"] = new_profile
                service.disconnect()
        except Exception as e:
            logger.error(f"Failed to update Mikrotik profile: {e}")
            response["mikrotik_error"] = str(e)
    
    # Update subscriber status
    await db.subscribers.update_one(
        {"account_number": account_number},
        {"$set": {
            "is_active": True,
            "reactivated_at": now,
            "pppoe_profile": new_profile,
            "plan_id": new_plan_id
        },
        "$unset": {
            "deactivated_at": "",
            "deactivation_reason": ""
        }}
    )
    
    # Log the reactivation
    await db.activity_logs.insert_one({
        "type": "reactivation",
        "subscriber_id": account_number,
        "reactivated_by": current_user['username'],
        "new_profile": new_profile,
        "timestamp": now
    })
    
    return response

@api_router.delete("/subscribers/{account_number}")
async def delete_subscriber(account_number: str, data: dict, current_user: dict = Depends(get_current_user)):
    """
    Delete a subscriber permanently.
    Requires admin password confirmation.
    """
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify admin password
    admin_password = data.get('admin_password')
    if not admin_password:
        raise HTTPException(status_code=400, detail="Admin password required")
    
    admin_user = await db.users.find_one({"username": current_user['username']})
    if not admin_user or not pwd_context.verify(admin_password, admin_user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid admin password")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    # Remove PPPoE account from Mikrotik
    mikrotik_config = await db.mikrotik_configs.find_one({})
    mikrotik_removed = False
    if mikrotik_config and subscriber.get('pppoe_username'):
        try:
            service = MikrotikService(mikrotik_config)
            if service.connect():
                resource = service.api.get_resource('/ppp/secret')
                secrets = resource.get(name=subscriber['pppoe_username'])
                if secrets:
                    resource.remove(id=secrets[0]['id'])
                    mikrotik_removed = True
                service.disconnect()
        except Exception as e:
            logger.error(f"Failed to remove Mikrotik account: {e}")
    
    # Delete subscriber and related data
    await db.subscribers.delete_one({"account_number": account_number})
    
    # Archive the subscriber data before deletion
    subscriber['deleted_at'] = datetime.now(timezone.utc)
    subscriber['deleted_by'] = current_user['username']
    await db.deleted_subscribers.insert_one(subscriber)
    
    # Log the deletion
    await db.activity_logs.insert_one({
        "type": "subscriber_deleted",
        "subscriber_id": account_number,
        "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}",
        "deleted_by": current_user['username'],
        "timestamp": datetime.now(timezone.utc)
    })
    
    return {
        "message": "Subscriber deleted successfully",
        "account_number": account_number,
        "mikrotik_account_removed": mikrotik_removed
    }

@api_router.post("/subscribers/{account_number}/charges")
async def add_manual_charge(account_number: str, data: dict, current_user: dict = Depends(get_current_user)):
    """
    Add manual charges to a subscriber (e.g., equipment replacement, service fees).
    """
    if current_user['role'] not in ['admin', 'billing', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    description = data.get('description')
    amount = data.get('amount')
    charge_type = data.get('charge_type', 'Other')
    
    if not description or amount is None:
        raise HTTPException(status_code=400, detail="Description and amount required")
    
    try:
        amount = float(amount)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid amount")
    
    now = datetime.now(timezone.utc)
    
    # Generate full description with date
    date_str = now.strftime("%B %d, %Y")
    full_description = f"{charge_type}: {description} - Charged on {date_str}"
    
    invoice = {
        "invoice_number": generate_invoice_number(),
        "subscriber_id": account_number,
        "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip(),
        "description": full_description,
        "amount": amount,
        "type": charge_type,
        "charge_date": now,
        "due_date": now + timedelta(days=15),
        "paid": False,
        "is_manual_charge": True,
        "created_by": current_user['username'],
        "created_at": now
    }
    await db.invoices.insert_one(invoice)
    
    # Log the charge
    await db.activity_logs.insert_one({
        "type": "manual_charge",
        "subscriber_id": account_number,
        "description": description,
        "amount": amount,
        "charge_type": charge_type,
        "created_by": current_user['username'],
        "timestamp": now
    })
    
    return {
        "message": "Charge added successfully",
        "invoice_number": invoice["invoice_number"],
        "amount": amount,
        "description": full_description
    }

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