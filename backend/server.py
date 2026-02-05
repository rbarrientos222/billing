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
        # Get billing day (1-31), default to 30 for backward compatibility
        billing_day = sub.get('billing_day', 30)
        # Handle legacy billing_period field
        if 'billing_period' in sub and 'billing_day' not in sub:
            billing_day = 15 if sub.get('billing_period') == "15th" else 30
        
        # For months with less days than billing_day, use the last day
        actual_billing_day = min(billing_day, last_day_of_month)
        
        # Check if today is the billing day
        if current_day == actual_billing_day:
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
                    period_info = get_billing_period_description(billing_day, today)
                    
                    invoice = {
                        "invoice_number": f"INV{today.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
                        "subscriber_id": sub['account_number'],
                        "subscriber_name": f"{sub.get('first_name', '')} {sub.get('last_name', '')}".strip(),
                        "plan_name": plan['name'],
                        "amount": plan['price'],
                        "description": period_info['description'],
                        "billing_day": billing_day,
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
    pppoe_activated: bool = False  # Track if PPPoE is actually activated in Mikrotik
    plan_id: Optional[str] = None
    billing_day: int = 30  # Day of month (1-31)
    installation_date: Optional[str] = None  # ISO date string
    is_active: bool = True
    modem_mac: Optional[str] = None
    assigned_unit_id: Optional[str] = None  # Inventory unit ID to assign on registration
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
    item_code: Optional[str] = None
    name: str
    category: str  # Equipment, Cable, Consumable, Tool, etc.
    description: Optional[str] = None
    quantity: float = 0
    unit: str  # pcs, meters, rolls, etc.
    cost_per_unit: float = 0
    restock_level: float = 0  # Alert when quantity falls below this
    is_serialized: bool = False  # True for items that need MAC/Serial tracking (routers, modems)
    is_bulk: bool = False  # True for items tracked by length/weight (cables, wires)
    total_length: Optional[float] = None  # For cables: total length in meters
    supplier: Optional[str] = None
    location: Optional[str] = None  # Storage location
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InventoryUnit(BaseModel):
    """Individual unit tracking for serialized equipment"""
    unit_id: Optional[str] = None
    item_code: Optional[str] = None  # Parent inventory item - optional since it comes from URL path
    mac_address: Optional[str] = None
    serial_number: Optional[str] = None
    status: str = "available"  # available, assigned, defective, returned
    assigned_to: Optional[str] = None  # Subscriber account number
    assigned_date: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Supplier(BaseModel):
    """Supplier/Vendor information"""
    supplier_id: Optional[str] = None
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PurchaseItem(BaseModel):
    """Individual item in a purchase"""
    item_code: Optional[str] = None  # None if creating new item
    name: str
    category: str = "Equipment"
    quantity: float
    unit: str = "pcs"
    unit_cost: float
    total_cost: float = 0
    is_new_item: bool = False  # True if this creates a new inventory item
    is_serialized: bool = False  # For items needing MAC/Serial tracking
    is_bulk: bool = False  # For items tracked by length

class PurchasePayment(BaseModel):
    """Payment record for a purchase"""
    payment_id: Optional[str] = None
    amount: float
    payment_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payment_mode: str = "cash"  # cash, bank_transfer, check, gcash
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class Purchase(BaseModel):
    """Purchase order/record"""
    purchase_id: Optional[str] = None
    po_number: Optional[str] = None  # Purchase Order number
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None  # For quick entry without creating supplier
    invoice_number: Optional[str] = None
    purchase_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    delivery_date: Optional[datetime] = None
    items: List[PurchaseItem] = []
    subtotal: float = 0
    total_amount: float = 0
    payment_status: str = "unpaid"  # unpaid, partial, paid
    amount_paid: float = 0
    payments: List[PurchasePayment] = []
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Expense(BaseModel):
    category: str
    description: str
    amount: float
    is_recurring: bool = False
    reference_type: Optional[str] = None  # 'purchase' for auto-created expenses
    reference_id: Optional[str] = None  # purchase_id for linking
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

def generate_purchase_id() -> str:
    return f"PO{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}"

def generate_supplier_id() -> str:
    return f"SUP{str(uuid.uuid4())[:8].upper()}"

def generate_payment_id() -> str:
    return f"PAY{str(uuid.uuid4())[:8].upper()}"

def get_billing_period_description(billing_day: int, reference_date: datetime = None) -> dict:
    """
    Generate billing period description based on billing day (1-31).
    Returns start date, end date, and formatted description.
    """
    if reference_date is None:
        reference_date = datetime.now(timezone.utc)
    
    current_day = reference_date.day
    current_month = reference_date.month
    current_year = reference_date.year
    
    # Get last day of current month
    last_day_of_month = calendar.monthrange(current_year, current_month)[1]
    actual_billing_day = min(billing_day, last_day_of_month)
    
    # Determine the billing cycle dates
    if current_day <= actual_billing_day:
        # Current cycle: prev month (billing_day+1) - current month billing_day
        if current_month == 1:
            prev_last_day = calendar.monthrange(current_year-1, 12)[1]
            prev_billing_day = min(billing_day, prev_last_day)
            start_date = datetime(current_year-1, 12, prev_billing_day) + timedelta(days=1)
        else:
            prev_last_day = calendar.monthrange(current_year, current_month-1)[1]
            prev_billing_day = min(billing_day, prev_last_day)
            start_date = datetime(current_year, current_month-1, prev_billing_day) + timedelta(days=1)
        end_date = reference_date.replace(day=actual_billing_day)
    else:
        # Current cycle: current month (billing_day+1) - next month billing_day
        start_date = reference_date.replace(day=actual_billing_day) + timedelta(days=1)
        if current_month == 12:
            next_last_day = calendar.monthrange(current_year+1, 1)[1]
            next_billing_day = min(billing_day, next_last_day)
            end_date = datetime(current_year+1, 1, next_billing_day)
        else:
            next_last_day = calendar.monthrange(current_year, current_month+1)[1]
            next_billing_day = min(billing_day, next_last_day)
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

def calculate_prorated_amount(monthly_rate: float, billing_day: int, installation_date: datetime) -> dict:
    """
    Calculate prorated bill based on installation date and billing day.
    
    Logic:
    - Calculate from installation_date until the billing_day
    - If billing_day already passed in current month, calculate to next month's billing_day
    
    Returns dict with amount and calculation details
    """
    now = installation_date
    current_day = now.day
    current_month = now.month
    current_year = now.year
    
    # Get last day of current month
    last_day_of_month = calendar.monthrange(current_year, current_month)[1]
    actual_billing_day = min(billing_day, last_day_of_month)
    
    # Calculate days remaining until billing day
    if current_day <= actual_billing_day:
        # Billing day is in current month
        days_remaining = actual_billing_day - current_day + 1  # +1 includes installation day
        end_date = datetime(current_year, current_month, actual_billing_day)
    else:
        # Billing day already passed, calculate for next month's cycle
        if current_month == 12:
            next_month = 1
            next_year = current_year + 1
        else:
            next_month = current_month + 1
            next_year = current_year
        
        next_month_last_day = calendar.monthrange(next_year, next_month)[1]
        next_billing_day = min(billing_day, next_month_last_day)
        
        days_remaining = (last_day_of_month - current_day + 1) + next_billing_day
        end_date = datetime(next_year, next_month, next_billing_day)
    
    # Calculate daily rate and prorated amount
    daily_rate = monthly_rate / 30  # Standard 30-day month for rate calculation
    prorated_amount = daily_rate * days_remaining
    
    return {
        "amount": round(prorated_amount, 2),
        "days_remaining": days_remaining,
        "billing_day": actual_billing_day,
        "daily_rate": round(daily_rate, 2),
        "start_date": installation_date.strftime("%B %d, %Y"),
        "end_date": end_date.strftime("%B %d, %Y"),
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

@api_router.put("/users/{username}/password")
async def change_user_password(username: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Change a user's password (admin only)"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_password = data.get('new_password')
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    hashed_password = pwd_context.hash(new_password)
    await db.users.update_one(
        {"username": username},
        {"$set": {"hashed_password": hashed_password}}
    )
    
    return {"message": "Password changed successfully"}

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
            # Update subscriber to mark PPPoE as activated
            await db.subscribers.update_one(
                {"account_number": account_number},
                {"$set": {"pppoe_activated": True}}
            )
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
            # Update subscriber to mark PPPoE as activated
            await db.subscribers.update_one(
                {"account_number": account_number},
                {"$set": {"pppoe_activated": True}}
            )
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

# ========== DASHBOARD STATS ==========
@api_router.get("/stats/monthly-sales")
async def get_monthly_sales(current_user: dict = Depends(get_current_user)):
    """Get monthly sales data for the last 12 months"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    months = []
    
    for i in range(11, -1, -1):
        # Calculate the month
        month_date = now - timedelta(days=i * 30)
        month_start = month_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if month_date.month == 12:
            month_end = month_start.replace(year=month_date.year + 1, month=1)
        else:
            month_end = month_start.replace(month=month_date.month + 1)
        
        # Query payments for this month - handle both amount and total_amount fields
        pipeline = [
            {"$match": {"payment_date": {"$gte": month_start, "$lt": month_end}}},
            {"$group": {
                "_id": None,
                "total": {"$sum": {"$ifNull": ["$total_amount", {"$ifNull": ["$amount", 0]}]}},
                "count": {"$sum": 1}
            }}
        ]
        
        result = await db.payments.aggregate(pipeline).to_list(1)
        
        month_name = month_start.strftime("%b")
        if result:
            months.append({
                "month": month_name,
                "sales": round(result[0]['total'], 2),
                "transactions": result[0]['count']
            })
        else:
            months.append({
                "month": month_name,
                "sales": 0,
                "transactions": 0
            })
    
    return months

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

@api_router.put("/plans/{plan_name}")
async def update_plan(plan_name: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update an existing subscription plan"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.subscription_plans.find_one({"name": plan_name})
    if not existing:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Don't allow changing the plan name
    if 'name' in updates:
        del updates['name']
    
    await db.subscription_plans.update_one({"name": plan_name}, {"$set": updates})
    return {"message": "Plan updated successfully"}

@api_router.delete("/plans/{plan_name}")
async def delete_plan(plan_name: str, current_user: dict = Depends(get_current_user)):
    """Delete a subscription plan"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if any subscribers are using this plan
    subscriber_count = await db.subscribers.count_documents({"plan_id": plan_name})
    if subscriber_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete plan. {subscriber_count} subscriber(s) are using this plan."
        )
    
    result = await db.subscription_plans.delete_one({"name": plan_name})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    return {"message": "Plan deleted successfully"}

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
    sub_dict.pop('assigned_unit_id', None)  # Don't store this field, handle separately
    sub_dict['pppoe_activated'] = pppoe_created  # Track PPPoE activation status
    result = await db.subscribers.insert_one(sub_dict)
    sub_id = str(result.inserted_id)
    
    # Assign inventory unit if specified
    assigned_equipment = None
    if subscriber.assigned_unit_id:
        unit = await db.inventory_units.find_one({"unit_id": subscriber.assigned_unit_id})
        if unit and unit.get('status') == 'available':
            await db.inventory_units.update_one(
                {"unit_id": subscriber.assigned_unit_id},
                {"$set": {
                    "status": "assigned",
                    "assigned_to": subscriber.account_number,
                    "assigned_date": datetime.now(timezone.utc)
                }}
            )
            # Get item details for response
            item = await db.inventory.find_one({"item_code": unit['item_code']}, {"_id": 0, "name": 1})
            assigned_equipment = {
                "unit_id": subscriber.assigned_unit_id,
                "mac_address": unit.get('mac_address'),
                "serial_number": unit.get('serial_number'),
                "item_name": item.get('name') if item else unit['item_code']
            }
            logger.info(f"Assigned unit {subscriber.assigned_unit_id} to subscriber {subscriber.account_number}")
    
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
            installation_date = datetime.now(timezone.utc)
            if subscriber.installation_date:
                try:
                    installation_date = datetime.fromisoformat(subscriber.installation_date.replace('Z', '+00:00'))
                except:
                    pass
            
            prorate_calc = calculate_prorated_amount(
                plan['price'], 
                subscriber.billing_day, 
                installation_date
            )
            prorated_amount = prorate_calc['amount']
            prorated_details = prorate_calc
            
            if prorated_amount > 0:
                # Determine due date based on billing day
                due_day = min(subscriber.billing_day, calendar.monthrange(installation_date.year, installation_date.month)[1])
                
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
                    "billing_day": subscriber.billing_day,
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
    
    if assigned_equipment:
        response_data["assigned_equipment"] = assigned_equipment
    
    if prorated_invoice:
        response_data["prorated_invoice"] = {
            "invoice_number": prorated_invoice["invoice_number"],
            "amount": prorated_invoice["amount"],
            "due_date": prorated_invoice["due_date"].isoformat(),
            "calculation": prorated_details['calculation'] if prorated_details else None,
            "days_covered": prorated_details['days_remaining'] if prorated_details else None
        }
    elif not subscriber.generate_prorated_bill:
        billing_suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(subscriber.billing_day % 10, 'th')
        if subscriber.billing_day in [11, 12, 13]:
            billing_suffix = 'th'
        response_data["billing_note"] = f"No prorated bill generated. First invoice will be on the {subscriber.billing_day}{billing_suffix}."
    
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

@api_router.get("/subscribers/{account_number}/equipment")
async def get_subscriber_equipment(account_number: str, current_user: dict = Depends(get_current_user)):
    """Get all equipment assigned to a subscriber"""
    units = await db.inventory_units.find(
        {"assigned_to": account_number},
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with item details
    for unit in units:
        item = await db.inventory.find_one(
            {"item_code": unit['item_code']}, 
            {"_id": 0, "name": 1, "category": 1}
        )
        if item:
            unit['item_name'] = item.get('name')
            unit['item_category'] = item.get('category')
    
    return units

@api_router.get("/payments/today-stats")
async def get_today_payment_stats(current_user: dict = Depends(get_current_user)):
    """
    Get payment statistics for today.
    """
    if current_user['role'] not in ['admin', 'cashier', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get start of today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Count and sum today's payments - handle both legacy 'amount' and centralized 'total_amount'
    pipeline = [
        {"$match": {"payment_date": {"$gte": today_start}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": {"$ifNull": ["$total_amount", {"$ifNull": ["$amount", 0]}]}},
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
    
    # Get billing_day from request (1-31) or default to 30
    billing_day = int(data.get('billing_day', 30))
    
    prorate_calc = calculate_prorated_amount(
        plan['price'],
        billing_day,
        installation_date
    )
    
    # Calculate due date
    due_day = min(billing_day, calendar.monthrange(installation_date.year, installation_date.month)[1])
    
    due_date = installation_date.replace(day=due_day)
    if due_date <= installation_date:
        if installation_date.month == 12:
            due_date = due_date.replace(year=installation_date.year + 1, month=1)
        else:
            due_date = due_date.replace(month=installation_date.month + 1)
    
    return {
        "plan_name": plan['name'],
        "monthly_rate": plan['price'],
        "billing_day": billing_day,
        "installation_date": installation_date.strftime("%Y-%m-%d"),
        "start_date": prorate_calc['start_date'],
        "end_date": prorate_calc['end_date'],
        "prorated_amount": prorate_calc['amount'],
        "days_covered": prorate_calc['days_remaining'],
        "daily_rate": prorate_calc['daily_rate'],
        "calculation": prorate_calc['calculation'],
        "due_date": due_date.strftime("%Y-%m-%d")
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
        # Get billing day (1-31), with backward compatibility for billing_period
        billing_day = subscriber.get('billing_day', 30)
        if 'billing_period' in subscriber and 'billing_day' not in subscriber:
            billing_day = 15 if subscriber.get('billing_period') == "15th" else 30
        
        # Calculate days remaining in billing period
        prorate_calc = calculate_prorated_amount(
            new_plan['price'] - old_plan['price'],  # Price difference
            billing_day,
            now
        )
        
        if prorate_calc['amount'] != 0:
            invoice_type = "Plan Upgrade" if prorate_calc['amount'] > 0 else "Plan Downgrade Credit"
            
            # Generate description for plan change
            period_info = get_billing_period_description(billing_day, now)
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
            # Get billing day with backward compatibility
            billing_day = subscriber.get('billing_day', 30)
            if 'billing_period' in subscriber and 'billing_day' not in subscriber:
                billing_day = 15 if subscriber.get('billing_period') == "15th" else 30
            
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
                period_info = get_billing_period_description(billing_day, now)
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
            # Get billing day with backward compatibility
            billing_day = subscriber.get('billing_day', 30)
            if 'billing_period' in subscriber and 'billing_day' not in subscriber:
                billing_day = 15 if subscriber.get('billing_period') == "15th" else 30
            
            prorate_calc = calculate_prorated_amount(
                plan['price'],
                billing_day,
                now
            )
            
            if prorate_calc['amount'] > 0:
                # Generate description for reactivation bill
                period_info = get_billing_period_description(billing_day, now)
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
    invoices = await db.invoices.find({"subscriber_id": account_number}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    # Add remaining balance for each invoice
    for inv in invoices:
        inv['remaining_balance'] = inv.get('amount', 0) - inv.get('paid_amount', 0)
    return invoices

# ========== PAYMENTS & CASHIER ==========
@api_router.post("/payments")
async def process_payment(payment: Payment, current_user: dict = Depends(get_current_user)):
    """Legacy single invoice payment - kept for compatibility"""
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
    
    return {"message": "Payment processed", "or_number": payment_dict['or_number']}

@api_router.post("/payments/centralized")
async def process_centralized_payment(data: dict, current_user: dict = Depends(get_current_user)):
    """
    Process centralized payment that allocates to multiple invoices.
    - Pays oldest invoices first (FIFO)
    - Supports partial payments
    - Excess goes to wallet/credit balance
    """
    if current_user['role'] not in ['admin', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber_id = data.get('subscriber_id')
    amount = float(data.get('amount', 0))
    mode = data.get('mode', 'cash')
    
    if not subscriber_id or amount <= 0:
        raise HTTPException(status_code=400, detail="Subscriber ID and amount required")
    
    subscriber = await db.subscribers.find_one({"account_number": subscriber_id})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    now = datetime.now(timezone.utc)
    or_number = f"OR{now.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}"
    
    # Get all unpaid invoices sorted by creation date (oldest first)
    unpaid_invoices = await db.invoices.find({
        "subscriber_id": subscriber_id,
        "paid": False
    }).sort("created_at", 1).to_list(100)
    
    remaining_amount = amount
    payments_made = []
    invoices_settled = []
    invoices_partial = []
    
    for invoice in unpaid_invoices:
        if remaining_amount <= 0:
            break
        
        invoice_balance = invoice.get('amount', 0) - invoice.get('paid_amount', 0)
        
        if remaining_amount >= invoice_balance:
            # Full payment for this invoice
            payment_for_invoice = invoice_balance
            remaining_amount -= invoice_balance
            
            # Update invoice as fully paid
            await db.invoices.update_one(
                {"invoice_number": invoice['invoice_number']},
                {"$set": {
                    "paid": True,
                    "paid_amount": invoice['amount'],
                    "paid_date": now,
                    "payment_or": or_number
                }}
            )
            invoices_settled.append({
                "invoice_number": invoice['invoice_number'],
                "amount_paid": payment_for_invoice,
                "description": invoice.get('description', invoice.get('plan_name', 'Invoice'))
            })
        else:
            # Partial payment for this invoice
            payment_for_invoice = remaining_amount
            new_paid_amount = invoice.get('paid_amount', 0) + remaining_amount
            remaining_amount = 0
            
            # Update invoice with partial payment
            await db.invoices.update_one(
                {"invoice_number": invoice['invoice_number']},
                {"$set": {
                    "paid_amount": new_paid_amount,
                    "last_payment_date": now,
                    "last_payment_or": or_number
                }}
            )
            invoices_partial.append({
                "invoice_number": invoice['invoice_number'],
                "amount_paid": payment_for_invoice,
                "remaining_balance": invoice['amount'] - new_paid_amount,
                "description": invoice.get('description', invoice.get('plan_name', 'Invoice'))
            })
        
        payments_made.append({
            "invoice_number": invoice['invoice_number'],
            "amount": payment_for_invoice
        })
    
    # Handle excess payment - add to wallet
    wallet_credit = 0
    if remaining_amount > 0:
        wallet_credit = remaining_amount
        
        # Update subscriber wallet
        current_wallet = subscriber.get('wallet_balance', 0)
        new_wallet = current_wallet + wallet_credit
        
        await db.subscribers.update_one(
            {"account_number": subscriber_id},
            {"$set": {"wallet_balance": new_wallet}}
        )
        
        # Log wallet credit
        await db.wallet_transactions.insert_one({
            "subscriber_id": subscriber_id,
            "type": "credit",
            "amount": wallet_credit,
            "description": f"Advance payment - OR# {or_number}",
            "or_number": or_number,
            "created_at": now
        })
    
    # Build payment descriptions for history
    payment_descriptions = []
    for inv in invoices_settled:
        inv_num = inv['invoice_number']
        desc = inv.get('description', f"Invoice {inv_num}")
        payment_descriptions.append(desc)
    for inv in invoices_partial:
        inv_num = inv['invoice_number']
        desc = inv.get('description', f"Invoice {inv_num}")
        payment_descriptions.append(f"{desc} (partial)")
    if wallet_credit > 0:
        payment_descriptions.append(f"Wallet credit: ₱{wallet_credit}")
    
    # Create main payment record
    payment_record = {
        "or_number": or_number,
        "subscriber_id": subscriber_id,
        "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip(),
        "total_amount": amount,
        "mode": mode,
        "payment_date": now,
        "received_by": current_user['username'],
        "invoices_settled": [p['invoice_number'] for p in invoices_settled],
        "invoices_partial": [p['invoice_number'] for p in invoices_partial],
        "invoices_settled_details": invoices_settled,
        "invoices_partial_details": invoices_partial,
        "description": "; ".join(payment_descriptions) if payment_descriptions else "Payment",
        "wallet_credit": wallet_credit,
        "allocation_details": payments_made
    }
    await db.payments.insert_one(payment_record)
    
    # Calculate new total balance
    updated_invoices = await db.invoices.find({
        "subscriber_id": subscriber_id,
        "paid": False
    }).to_list(100)
    new_total_balance = sum(
        inv.get('amount', 0) - inv.get('paid_amount', 0) 
        for inv in updated_invoices
    )
    
    return {
        "message": "Payment processed successfully",
        "or_number": or_number,
        "total_paid": amount,
        "invoices_fully_paid": invoices_settled,
        "invoices_partially_paid": invoices_partial,
        "wallet_credit_added": wallet_credit,
        "new_wallet_balance": subscriber.get('wallet_balance', 0) + wallet_credit,
        "remaining_balance": new_total_balance
    }

@api_router.get("/subscribers/{account_number}/wallet")
async def get_subscriber_wallet(account_number: str, current_user: dict = Depends(get_current_user)):
    """Get subscriber wallet balance and transaction history"""
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    transactions = await db.wallet_transactions.find(
        {"subscriber_id": account_number},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    return {
        "balance": subscriber.get('wallet_balance', 0),
        "transactions": transactions
    }

@api_router.post("/payments/use-wallet")
async def use_wallet_for_payment(data: dict, current_user: dict = Depends(get_current_user)):
    """Use wallet balance to pay outstanding invoices"""
    if current_user['role'] not in ['admin', 'cashier', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber_id = data.get('subscriber_id')
    
    subscriber = await db.subscribers.find_one({"account_number": subscriber_id})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    wallet_balance = subscriber.get('wallet_balance', 0)
    if wallet_balance <= 0:
        return {"message": "No wallet balance available", "amount_used": 0}
    
    # Process payment using wallet balance
    result = await process_centralized_payment({
        "subscriber_id": subscriber_id,
        "amount": wallet_balance,
        "mode": "wallet"
    }, current_user)
    
    # Deduct from wallet
    used_amount = wallet_balance - result.get('wallet_credit_added', 0)
    new_balance = result.get('wallet_credit_added', 0)
    
    await db.subscribers.update_one(
        {"account_number": subscriber_id},
        {"$set": {"wallet_balance": new_balance}}
    )
    
    # Log wallet debit
    if used_amount > 0:
        await db.wallet_transactions.insert_one({
            "subscriber_id": subscriber_id,
            "type": "debit",
            "amount": used_amount,
            "description": f"Auto-payment from wallet - OR# {result['or_number']}",
            "or_number": result['or_number'],
            "created_at": datetime.now(timezone.utc)
        })
    
    return {
        "message": "Wallet payment processed",
        "amount_used": used_amount,
        "remaining_wallet_balance": new_balance
    }
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
def generate_item_code():
    """Generate a unique item code"""
    return f"ITM{uuid.uuid4().hex[:8].upper()}"

@api_router.get("/inventory")
async def list_inventory(current_user: dict = Depends(get_current_user)):
    """List all inventory items with low stock alerts"""
    items = await db.inventory.find({}, {"_id": 0}).to_list(1000)
    
    # Add low stock flag
    for item in items:
        item['low_stock'] = item.get('quantity', 0) <= item.get('restock_level', 0) and item.get('restock_level', 0) > 0
        # Calculate total value
        item['total_value'] = round(item.get('quantity', 0) * item.get('cost_per_unit', 0), 2)
    
    return items

@api_router.get("/inventory/stats")
async def get_inventory_stats(current_user: dict = Depends(get_current_user)):
    """Get inventory statistics"""
    items = await db.inventory.find({}, {"_id": 0}).to_list(1000)
    
    total_items = len(items)
    total_value = sum(item.get('quantity', 0) * item.get('cost_per_unit', 0) for item in items)
    low_stock_count = sum(1 for item in items if item.get('quantity', 0) <= item.get('restock_level', 0) and item.get('restock_level', 0) > 0)
    
    # Group by category
    categories = {}
    for item in items:
        cat = item.get('category', 'Uncategorized')
        if cat not in categories:
            categories[cat] = {'count': 0, 'value': 0}
        categories[cat]['count'] += 1
        categories[cat]['value'] += item.get('quantity', 0) * item.get('cost_per_unit', 0)
    
    return {
        "total_items": total_items,
        "total_value": round(total_value, 2),
        "low_stock_count": low_stock_count,
        "categories": categories
    }

@api_router.get("/inventory/low-stock")
async def get_low_stock_items(current_user: dict = Depends(get_current_user)):
    """Get items that need restocking"""
    items = await db.inventory.find({}, {"_id": 0}).to_list(1000)
    
    low_stock = []
    for item in items:
        if item.get('restock_level', 0) > 0 and item.get('quantity', 0) <= item.get('restock_level', 0):
            item['shortage'] = item.get('restock_level', 0) - item.get('quantity', 0)
            low_stock.append(item)
    
    return low_stock

@api_router.get("/inventory/{item_code}")
async def get_inventory_item(item_code: str, current_user: dict = Depends(get_current_user)):
    """Get a single inventory item"""
    item = await db.inventory.find_one({"item_code": item_code}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@api_router.post("/inventory")
async def create_inventory_item(item: Inventory, current_user: dict = Depends(get_current_user)):
    """Create a new inventory item"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    item_dict = item.model_dump()
    item_dict['item_code'] = generate_item_code()
    item_dict['created_at'] = datetime.now(timezone.utc)
    item_dict['updated_at'] = datetime.now(timezone.utc)
    
    # For bulk items (cables), set quantity based on total_length if provided
    if item.is_bulk and item.total_length:
        item_dict['quantity'] = item.total_length
    
    await db.inventory.insert_one(item_dict)
    return {"message": "Inventory item created", "item_code": item_dict['item_code']}

@api_router.put("/inventory/{item_code}")
async def update_inventory_item(item_code: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update an inventory item"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    existing = await db.inventory.find_one({"item_code": item_code})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    updates['updated_at'] = datetime.now(timezone.utc)
    await db.inventory.update_one({"item_code": item_code}, {"$set": updates})
    return {"message": "Inventory item updated"}

@api_router.delete("/inventory/{item_code}")
async def delete_inventory_item(item_code: str, current_user: dict = Depends(get_current_user)):
    """Delete an inventory item"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.inventory.delete_one({"item_code": item_code})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Inventory item deleted"}

@api_router.post("/inventory/{item_code}/adjust")
async def adjust_inventory(item_code: str, data: dict, current_user: dict = Depends(get_current_user)):
    """
    Adjust inventory quantity (add or deduct stock)
    Used for: restocking, usage deduction, corrections
    """
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    item = await db.inventory.find_one({"item_code": item_code})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    adjustment_type = data.get('type', 'deduct')  # 'add' or 'deduct'
    amount = float(data.get('amount', 0))
    reason = data.get('reason', '')
    job_order_id = data.get('job_order_id')
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    current_qty = item.get('quantity', 0)
    
    if adjustment_type == 'add':
        new_qty = current_qty + amount
    else:  # deduct
        if amount > current_qty:
            raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {current_qty} {item.get('unit', 'units')}")
        new_qty = current_qty - amount
    
    # Update inventory
    await db.inventory.update_one(
        {"item_code": item_code},
        {"$set": {"quantity": new_qty, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Log the adjustment
    log_entry = {
        "item_code": item_code,
        "item_name": item.get('name'),
        "type": adjustment_type,
        "amount": amount,
        "unit": item.get('unit'),
        "previous_qty": current_qty,
        "new_qty": new_qty,
        "reason": reason,
        "job_order_id": job_order_id,
        "adjusted_by": current_user['username'],
        "adjusted_at": datetime.now(timezone.utc)
    }
    await db.inventory_logs.insert_one(log_entry)
    
    return {
        "message": f"Inventory adjusted: {adjustment_type} {amount} {item.get('unit', 'units')}",
        "previous_quantity": current_qty,
        "new_quantity": new_qty,
        "low_stock": new_qty <= item.get('restock_level', 0) and item.get('restock_level', 0) > 0
    }

@api_router.get("/inventory/{item_code}/history")
async def get_inventory_history(item_code: str, current_user: dict = Depends(get_current_user)):
    """Get adjustment history for an inventory item"""
    logs = await db.inventory_logs.find(
        {"item_code": item_code}, 
        {"_id": 0}
    ).sort("adjusted_at", -1).to_list(100)
    return logs

# ========== INVENTORY UNITS (MAC/Serial Tracking) ==========
def generate_unit_id():
    """Generate a unique unit ID"""
    return f"UNIT{uuid.uuid4().hex[:8].upper()}"

@api_router.get("/inventory/{item_code}/units")
async def list_inventory_units(item_code: str, current_user: dict = Depends(get_current_user)):
    """List all individual units for a serialized inventory item"""
    units = await db.inventory_units.find(
        {"item_code": item_code}, 
        {"_id": 0}
    ).to_list(1000)
    return units

@api_router.post("/inventory/{item_code}/units")
async def add_inventory_unit(item_code: str, unit: InventoryUnit, current_user: dict = Depends(get_current_user)):
    """Add an individual unit with MAC/Serial to inventory"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Verify item exists and is serialized
    item = await db.inventory.find_one({"item_code": item_code})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    if not item.get('is_serialized'):
        raise HTTPException(status_code=400, detail="This item is not configured for unit tracking")
    
    # Check for duplicate MAC or Serial
    if unit.mac_address:
        existing = await db.inventory_units.find_one({"mac_address": unit.mac_address})
        if existing:
            raise HTTPException(status_code=400, detail=f"MAC address already exists in inventory")
    
    if unit.serial_number:
        existing = await db.inventory_units.find_one({"serial_number": unit.serial_number})
        if existing:
            raise HTTPException(status_code=400, detail=f"Serial number already exists in inventory")
    
    unit_dict = unit.model_dump()
    unit_dict['unit_id'] = generate_unit_id()
    unit_dict['item_code'] = item_code
    unit_dict['created_at'] = datetime.now(timezone.utc)
    
    await db.inventory_units.insert_one(unit_dict)
    
    # Update the parent inventory count
    await db.inventory.update_one(
        {"item_code": item_code},
        {"$inc": {"quantity": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Unit added to inventory", "unit_id": unit_dict['unit_id']}

@api_router.put("/inventory/units/{unit_id}")
async def update_inventory_unit(unit_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update an individual unit's details"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    existing = await db.inventory_units.find_one({"unit_id": unit_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    await db.inventory_units.update_one({"unit_id": unit_id}, {"$set": updates})
    return {"message": "Unit updated"}

@api_router.post("/inventory/units/{unit_id}/assign")
async def assign_unit_to_subscriber(unit_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Assign a unit to a subscriber"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    unit = await db.inventory_units.find_one({"unit_id": unit_id})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    if unit.get('status') == 'assigned':
        raise HTTPException(status_code=400, detail=f"Unit already assigned to {unit.get('assigned_to')}")
    
    subscriber_id = data.get('subscriber_id')
    if not subscriber_id:
        raise HTTPException(status_code=400, detail="Subscriber ID required")
    
    await db.inventory_units.update_one(
        {"unit_id": unit_id},
        {"$set": {
            "status": "assigned",
            "assigned_to": subscriber_id,
            "assigned_date": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": f"Unit assigned to {subscriber_id}"}

@api_router.post("/inventory/units/{unit_id}/return")
async def return_unit_from_subscriber(unit_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Return a unit from a subscriber"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    unit = await db.inventory_units.find_one({"unit_id": unit_id})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    new_status = data.get('status', 'available')  # available or defective
    
    await db.inventory_units.update_one(
        {"unit_id": unit_id},
        {"$set": {
            "status": new_status,
            "assigned_to": None,
            "assigned_date": None,
            "notes": data.get('notes', '')
        }}
    )
    
    return {"message": f"Unit returned and marked as {new_status}"}

@api_router.delete("/inventory/units/{unit_id}")
async def delete_inventory_unit(unit_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an individual unit from inventory"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    unit = await db.inventory_units.find_one({"unit_id": unit_id})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    if unit.get('status') == 'assigned':
        raise HTTPException(status_code=400, detail="Cannot delete assigned unit. Return it first.")
    
    # Delete the unit
    await db.inventory_units.delete_one({"unit_id": unit_id})
    
    # Update parent inventory count
    await db.inventory.update_one(
        {"item_code": unit['item_code']},
        {"$inc": {"quantity": -1}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Unit deleted from inventory"}

@api_router.get("/inventory/units/search")
async def search_inventory_units(
    q: str,
    current_user: dict = Depends(get_current_user)
):
    """Search units by MAC address or serial number"""
    query = {
        "$or": [
            {"mac_address": {"$regex": q, "$options": "i"}},
            {"serial_number": {"$regex": q, "$options": "i"}}
        ]
    }
    units = await db.inventory_units.find(query, {"_id": 0}).to_list(50)
    
    # Enrich with item details
    for unit in units:
        item = await db.inventory.find_one({"item_code": unit['item_code']}, {"_id": 0, "name": 1, "category": 1})
        if item:
            unit['item_name'] = item.get('name')
            unit['item_category'] = item.get('category')
    
    return units

# ========== SUPPLIERS ==========
@api_router.get("/suppliers")
async def list_suppliers(current_user: dict = Depends(get_current_user)):
    """List all suppliers"""
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(1000)
    return suppliers

@api_router.get("/suppliers/{supplier_id}")
async def get_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single supplier"""
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

@api_router.post("/suppliers")
async def create_supplier(supplier: Supplier, current_user: dict = Depends(get_current_user)):
    """Create a new supplier"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    supplier_dict = supplier.model_dump()
    supplier_dict['supplier_id'] = generate_supplier_id()
    supplier_dict['created_at'] = datetime.now(timezone.utc)
    
    await db.suppliers.insert_one(supplier_dict)
    return {"message": "Supplier created", "supplier_id": supplier_dict['supplier_id']}

@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update a supplier"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    existing = await db.suppliers.find_one({"supplier_id": supplier_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    updates.pop('supplier_id', None)
    updates.pop('created_at', None)
    
    await db.suppliers.update_one({"supplier_id": supplier_id}, {"$set": updates})
    return {"message": "Supplier updated"}

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a supplier"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.suppliers.delete_one({"supplier_id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier deleted"}

# ========== PURCHASES ==========
@api_router.get("/purchases")
async def list_purchases(
    current_user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    supplier_id: Optional[str] = None
):
    """List all purchases with optional filters"""
    query = {}
    if status:
        query["payment_status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    
    purchases = await db.purchases.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return purchases

@api_router.get("/purchases/stats")
async def get_purchase_stats(current_user: dict = Depends(get_current_user)):
    """Get purchase statistics"""
    total_purchases = await db.purchases.count_documents({})
    
    # Total spent
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}]
    result = await db.purchases.aggregate(pipeline).to_list(1)
    total_spent = result[0]['total'] if result else 0
    
    # Unpaid amount
    pipeline = [
        {"$match": {"payment_status": {"$ne": "paid"}}},
        {"$group": {"_id": None, "total": {"$sum": {"$subtract": ["$total_amount", "$amount_paid"]}}}}
    ]
    result = await db.purchases.aggregate(pipeline).to_list(1)
    unpaid_amount = result[0]['total'] if result else 0
    
    # This month's purchases
    start_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {"$match": {"purchase_date": {"$gte": start_of_month}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.purchases.aggregate(pipeline).to_list(1)
    monthly_total = result[0]['total'] if result else 0
    monthly_count = result[0]['count'] if result else 0
    
    return {
        "total_purchases": total_purchases,
        "total_spent": total_spent,
        "unpaid_amount": unpaid_amount,
        "monthly_total": monthly_total,
        "monthly_count": monthly_count
    }

@api_router.get("/purchases/{purchase_id}")
async def get_purchase(purchase_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single purchase with full details"""
    purchase = await db.purchases.find_one({"purchase_id": purchase_id}, {"_id": 0})
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    # Get supplier details if supplier_id exists
    if purchase.get('supplier_id'):
        supplier = await db.suppliers.find_one({"supplier_id": purchase['supplier_id']}, {"_id": 0})
        purchase['supplier'] = supplier
    
    return purchase

@api_router.post("/purchases")
async def create_purchase(purchase: Purchase, current_user: dict = Depends(get_current_user)):
    """Create a new purchase and update inventory"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    purchase_dict = purchase.model_dump()
    purchase_dict['purchase_id'] = generate_purchase_id()
    purchase_dict['created_by'] = current_user['sub']
    purchase_dict['created_at'] = datetime.now(timezone.utc)
    
    # Calculate totals
    subtotal = 0
    items_processed = []
    
    for item in purchase_dict['items']:
        item['total_cost'] = item['quantity'] * item['unit_cost']
        subtotal += item['total_cost']
        
        # Create or update inventory item
        if item.get('is_new_item') or not item.get('item_code'):
            # Create new inventory item
            new_item_code = generate_item_code()
            inventory_item = {
                "item_code": new_item_code,
                "name": item['name'],
                "category": item.get('category', 'Equipment'),
                "description": f"Added via purchase {purchase_dict['purchase_id']}",
                "quantity": item['quantity'],
                "unit": item.get('unit', 'pcs'),
                "cost_per_unit": item['unit_cost'],
                "restock_level": 0,
                "is_serialized": item.get('is_serialized', False),
                "is_bulk": item.get('is_bulk', False),
                "total_length": item['quantity'] if item.get('is_bulk') else None,
                "supplier": purchase_dict.get('supplier_name', ''),
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            await db.inventory.insert_one(inventory_item)
            item['item_code'] = new_item_code
            logger.info(f"Created new inventory item {new_item_code} from purchase")
        else:
            # Update existing inventory item quantity
            existing_item = await db.inventory.find_one({"item_code": item['item_code']})
            if existing_item:
                if existing_item.get('is_bulk'):
                    # For bulk items, add to total_length
                    await db.inventory.update_one(
                        {"item_code": item['item_code']},
                        {
                            "$inc": {"quantity": item['quantity'], "total_length": item['quantity']},
                            "$set": {"updated_at": datetime.now(timezone.utc)}
                        }
                    )
                else:
                    # For regular items, just add quantity
                    await db.inventory.update_one(
                        {"item_code": item['item_code']},
                        {
                            "$inc": {"quantity": item['quantity']},
                            "$set": {"updated_at": datetime.now(timezone.utc)}
                        }
                    )
                
                # Log inventory adjustment
                log_entry = {
                    "item_code": item['item_code'],
                    "adjustment_type": "purchase",
                    "quantity_change": item['quantity'],
                    "previous_quantity": existing_item.get('quantity', 0),
                    "new_quantity": existing_item.get('quantity', 0) + item['quantity'],
                    "reason": f"Purchase {purchase_dict['purchase_id']}",
                    "reference_id": purchase_dict['purchase_id'],
                    "performed_by": current_user['sub'],
                    "created_at": datetime.now(timezone.utc)
                }
                await db.inventory_logs.insert_one(log_entry)
        
        items_processed.append(item)
    
    purchase_dict['items'] = items_processed
    purchase_dict['subtotal'] = subtotal
    purchase_dict['total_amount'] = subtotal  # Can add tax/shipping later
    
    # Handle initial payment if any
    if purchase_dict.get('payments') and len(purchase_dict['payments']) > 0:
        total_paid = sum(p.get('amount', 0) for p in purchase_dict['payments'])
        purchase_dict['amount_paid'] = total_paid
        for payment in purchase_dict['payments']:
            payment['payment_id'] = generate_payment_id()
        
        if total_paid >= purchase_dict['total_amount']:
            purchase_dict['payment_status'] = 'paid'
        elif total_paid > 0:
            purchase_dict['payment_status'] = 'partial'
    
    # Save purchase
    await db.purchases.insert_one(purchase_dict)
    
    # Create expense entry
    expense_entry = {
        "category": "Inventory Purchase",
        "description": f"Purchase from {purchase_dict.get('supplier_name', 'Supplier')} - {len(items_processed)} item(s)",
        "amount": purchase_dict['total_amount'],
        "is_recurring": False,
        "reference_type": "purchase",
        "reference_id": purchase_dict['purchase_id'],
        "expense_date": purchase_dict['purchase_date']
    }
    await db.expenses.insert_one(expense_entry)
    logger.info(f"Created expense entry for purchase {purchase_dict['purchase_id']}")
    
    return {
        "message": "Purchase created successfully",
        "purchase_id": purchase_dict['purchase_id'],
        "total_amount": purchase_dict['total_amount'],
        "items_added": len(items_processed),
        "expense_created": True
    }

@api_router.post("/purchases/{purchase_id}/payment")
async def add_purchase_payment(purchase_id: str, payment: PurchasePayment, current_user: dict = Depends(get_current_user)):
    """Add a payment to a purchase"""
    if current_user['role'] not in ['admin', 'billing', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    purchase = await db.purchases.find_one({"purchase_id": purchase_id})
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    if purchase.get('payment_status') == 'paid':
        raise HTTPException(status_code=400, detail="Purchase is already fully paid")
    
    payment_dict = payment.model_dump()
    payment_dict['payment_id'] = generate_payment_id()
    payment_dict['payment_date'] = datetime.now(timezone.utc)
    
    # Calculate new totals
    new_amount_paid = purchase.get('amount_paid', 0) + payment_dict['amount']
    remaining = purchase['total_amount'] - new_amount_paid
    
    if remaining <= 0:
        new_status = 'paid'
    elif new_amount_paid > 0:
        new_status = 'partial'
    else:
        new_status = 'unpaid'
    
    await db.purchases.update_one(
        {"purchase_id": purchase_id},
        {
            "$push": {"payments": payment_dict},
            "$set": {
                "amount_paid": new_amount_paid,
                "payment_status": new_status
            }
        }
    )
    
    return {
        "message": "Payment added",
        "payment_id": payment_dict['payment_id'],
        "amount_paid": new_amount_paid,
        "remaining": max(0, remaining),
        "status": new_status
    }

@api_router.put("/purchases/{purchase_id}")
async def update_purchase(purchase_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update a purchase (limited fields)"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    existing = await db.purchases.find_one({"purchase_id": purchase_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    # Only allow updating certain fields
    allowed_fields = ['notes', 'delivery_date', 'invoice_number', 'supplier_name']
    filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}
    
    if filtered_updates:
        await db.purchases.update_one({"purchase_id": purchase_id}, {"$set": filtered_updates})
    
    return {"message": "Purchase updated"}

@api_router.delete("/purchases/{purchase_id}")
async def delete_purchase(purchase_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a purchase (admin only, should be used carefully)"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    purchase = await db.purchases.find_one({"purchase_id": purchase_id})
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    # Note: This does NOT reverse inventory changes - that would need separate logic
    await db.purchases.delete_one({"purchase_id": purchase_id})
    
    # Also delete associated expense
    await db.expenses.delete_one({"reference_id": purchase_id, "reference_type": "purchase"})
    
    return {"message": "Purchase deleted"}

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
    
    # Gross sales - handle both 'amount' (legacy) and 'total_amount' (centralized payments)
    payments = await db.payments.find({}).to_list(10000)
    gross_sales = sum(p.get('total_amount', p.get('amount', 0)) for p in payments)
    
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
    """Get subscribers with upcoming billing grouped by billing day"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    today = datetime.now(timezone.utc)
    current_day = today.day
    last_day_of_month = calendar.monthrange(today.year, today.month)[1]
    
    # Get all active subscribers
    all_subscribers = await db.subscribers.find(
        {"is_active": True}, 
        {"_id": 0, "account_number": 1, "first_name": 1, "last_name": 1, "plan_id": 1, "billing_day": 1, "billing_period": 1}
    ).to_list(10000)
    
    # Group by billing day
    billing_groups = {}
    for sub in all_subscribers:
        # Get billing day with backward compatibility
        billing_day = sub.get('billing_day', 30)
        if 'billing_period' in sub and 'billing_day' not in sub:
            billing_day = 15 if sub.get('billing_period') == "15th" else 30
        
        if billing_day not in billing_groups:
            billing_groups[billing_day] = []
        billing_groups[billing_day].append(sub)
    
    # Calculate days until for each group
    result = {}
    for billing_day, subscribers in sorted(billing_groups.items()):
        actual_billing_day = min(billing_day, last_day_of_month)
        if current_day <= actual_billing_day:
            days_until = actual_billing_day - current_day
        else:
            # Next month
            next_month_last_day = calendar.monthrange(today.year, today.month + 1 if today.month < 12 else 1)[1]
            days_until = (last_day_of_month - current_day) + min(billing_day, next_month_last_day)
        
        result[f"billing_{billing_day}"] = {
            "billing_day": billing_day,
            "count": len(subscribers),
            "days_until": days_until,
            "subscribers": subscribers[:10]  # Return first 10 for preview
        }
    
    return result

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