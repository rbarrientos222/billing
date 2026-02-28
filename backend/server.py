from fastapi import FastAPI, APIRouter, Depends, HTTPException, File, UploadFile, Query
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
import httpx
from bson import ObjectId
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib import colors
from io import BytesIO, StringIO
import csv
from fastapi.responses import StreamingResponse
import uuid
import calendar
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import asyncio
from zoneinfo import ZoneInfo
import hmac
import hashlib

# Philippine Standard Time (UTC+8)
PH_TIMEZONE = ZoneInfo("Asia/Manila")

def get_ph_now():
    """Get current datetime in Philippine Standard Time"""
    return datetime.now(PH_TIMEZONE)

def to_ph_time(dt: datetime) -> datetime:
    """Convert a datetime to Philippine Standard Time"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(PH_TIMEZONE)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Security: Require SECRET_KEY and ENCRYPTION_KEY from environment
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")

ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY')
if not ENCRYPTION_KEY:
    raise ValueError("ENCRYPTION_KEY environment variable is required")
ENCRYPTION_KEY = ENCRYPTION_KEY.encode()
if len(ENCRYPTION_KEY) < 32:
    ENCRYPTION_KEY = ENCRYPTION_KEY.ljust(32, b'0')
fernet_key = base64.urlsafe_b64encode(ENCRYPTION_KEY[:32])
fernet = Fernet(fernet_key)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

app = FastAPI(title="Billing System API")

# CORS Configuration for production deployment
cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins != ['*'] else ['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

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
    For new subscribers (first billing), creates prorated invoice from installation date.
    Uses Philippine Standard Time (UTC+8).
    """
    today = get_ph_now()
    current_day = today.day
    last_day_of_month = calendar.monthrange(today.year, today.month)[1]
    
    logger.info(f"Running automatic billing check for day {current_day} (PH Time: {today.strftime('%Y-%m-%d %H:%M:%S')})")
    
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
            account_number = sub['account_number']
            
            # Check if ANY invoice already exists for today (prevent duplicates from multiple runs)
            today_start = today.replace(hour=0, minute=0, second=0, microsecond=0)
            existing_today = await db.invoices.find_one({
                "subscriber_id": account_number,
                "created_at": {"$gte": today_start}
            })
            
            if existing_today:
                logger.info(f"Invoice already exists for {account_number} today, skipping")
                continue
            
            # Check if there's a prorated invoice that covers through this billing day
            existing_prorated = await db.invoices.find_one({
                "subscriber_id": account_number,
                "is_prorated": True,
                "billing_end": {"$gte": today_start}
            })
            
            if existing_prorated:
                logger.info(f"Prorated invoice covers {account_number} through today, skipping")
                continue
            
            # Get subscriber's plan
            plan = await db.subscription_plans.find_one({"name": sub.get('plan_id')})
            if not plan:
                logger.warning(f"No plan found for subscriber {account_number}")
                continue
            
            # Check if this is the subscriber's FIRST invoice (new subscriber without prorated bill)
            existing_invoices = await db.invoices.count_documents({"subscriber_id": account_number})
            
            # Calculate due date - 5 days after billing date
            due_date = today + timedelta(days=5)
            # Ensure due_date is in PH timezone
            if due_date.tzinfo is None:
                due_date = due_date.replace(tzinfo=PH_TIMEZONE)
            
            if existing_invoices == 0:
                # FIRST INVOICE - Check if we need to prorate from installation date
                installation_date = sub.get('installation_date')
                if installation_date:
                    if isinstance(installation_date, str):
                        try:
                            installation_date = datetime.fromisoformat(installation_date.replace('Z', '+00:00'))
                        except:
                            installation_date = today
                    
                    # Calculate prorated amount from installation to billing day
                    prorate_calc = calculate_prorated_amount(plan['price'], billing_day, installation_date)
                    days = prorate_calc.get('days_remaining', 0)
                    
                    if days > 0 and days < 30:
                        # Create prorated invoice
                        prorate_amount = prorate_calc['amount']
                        invoice = {
                            "invoice_number": f"INV{today.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
                            "subscriber_id": account_number,
                            "subscriber_name": f"{sub.get('first_name', '')} {sub.get('last_name', '')}".strip(),
                            "plan_name": plan['name'],
                            "amount": prorate_amount,
                            "paid_amount": 0,
                            "description": f"Prorated bill for period {installation_date.strftime('%B %d, %Y')} - {today.strftime('%B %d, %Y')} ({days} days)",
                            "billing_day": billing_day,
                            "billing_start": installation_date,
                            "billing_end": today,
                            "due_date": due_date,
                            "paid": False,
                            "is_prorated": True,
                            "created_at": today
                        }
                        await db.invoices.insert_one(invoice)
                        invoices_generated += 1
                        logger.info(f"Generated PRORATED invoice {invoice['invoice_number']} for new subscriber {account_number}: {days} days = ₱{prorate_amount}")
                        
                        # AUTO-APPLY WALLET CREDIT for prorated invoice
                        wallet_balance = sub.get('wallet_balance', 0)
                        if wallet_balance > 0:
                            amount_to_apply = min(wallet_balance, prorate_amount)
                            new_wallet_balance = wallet_balance - amount_to_apply
                            
                            if amount_to_apply >= prorate_amount:
                                await db.invoices.update_one(
                                    {"invoice_number": invoice['invoice_number']},
                                    {"$set": {"paid": True, "paid_amount": prorate_amount, "paid_at": today}}
                                )
                                logger.info(f"Prorated invoice {invoice['invoice_number']} fully paid from wallet (₱{amount_to_apply})")
                            else:
                                await db.invoices.update_one(
                                    {"invoice_number": invoice['invoice_number']},
                                    {"$set": {"paid_amount": amount_to_apply}}
                                )
                                logger.info(f"Prorated invoice {invoice['invoice_number']} partially paid from wallet (₱{amount_to_apply})")
                            
                            await db.subscribers.update_one(
                                {"account_number": account_number},
                                {"$set": {"wallet_balance": new_wallet_balance}}
                            )
                            
                            await db.wallet_transactions.insert_one({
                                "subscriber_id": account_number,
                                "type": "debit",
                                "amount": amount_to_apply,
                                "description": f"Auto-payment for prorated bill {invoice['invoice_number']}",
                                "created_at": today
                            })
                        
                        continue
            
            # Regular full invoice for existing subscribers
            period_info = get_billing_period_description(billing_day, today)
            
            invoice = {
                "invoice_number": f"INV{today.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
                "subscriber_id": account_number,
                "subscriber_name": f"{sub.get('first_name', '')} {sub.get('last_name', '')}".strip(),
                "plan_name": plan['name'],
                "amount": plan['price'],
                "paid_amount": 0,
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
            logger.info(f"Generated invoice {invoice['invoice_number']} for {account_number}")
            
            # AUTO-APPLY WALLET CREDIT if subscriber has balance
            wallet_balance = sub.get('wallet_balance', 0)
            if wallet_balance > 0:
                amount_to_apply = min(wallet_balance, plan['price'])
                new_wallet_balance = wallet_balance - amount_to_apply
                
                # Update invoice as paid (fully or partially)
                if amount_to_apply >= plan['price']:
                    # Fully paid from wallet
                    await db.invoices.update_one(
                        {"invoice_number": invoice['invoice_number']},
                        {"$set": {"paid": True, "paid_amount": plan['price'], "paid_at": today}}
                    )
                    logger.info(f"Invoice {invoice['invoice_number']} fully paid from wallet (₱{amount_to_apply})")
                else:
                    # Partially paid from wallet
                    await db.invoices.update_one(
                        {"invoice_number": invoice['invoice_number']},
                        {"$set": {"paid_amount": amount_to_apply}}
                    )
                    logger.info(f"Invoice {invoice['invoice_number']} partially paid from wallet (₱{amount_to_apply})")
                
                # Deduct from subscriber wallet
                await db.subscribers.update_one(
                    {"account_number": account_number},
                    {"$set": {"wallet_balance": new_wallet_balance}}
                )
                
                # Log wallet transaction
                await db.wallet_transactions.insert_one({
                    "subscriber_id": account_number,
                    "type": "debit",
                    "amount": amount_to_apply,
                    "description": f"Auto-payment for {invoice['invoice_number']}",
                    "created_at": today
                })
    
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
    pppoe_username: str  # Required
    pppoe_password: str  # Required
    pppoe_profile: str   # Required
    activate_pppoe: bool = False
    pppoe_activated: bool = False  # Track if PPPoE is actually activated in Mikrotik
    plan_id: str  # Required - Subscription Plan
    billing_day: int = 30  # Day of month (1-31)
    installation_date: Optional[str] = None  # ISO date string
    is_active: bool = True
    modem_mac: Optional[str] = None
    assigned_unit_id: str  # Required - Modem/Equipment
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
    job_order_id: Optional[str] = None
    subscriber_id: str
    subscriber_name: Optional[str] = None
    subscriber_address: Optional[str] = None
    type: str  # Installation, Repair, Relocation, Disconnection, Reactivation, Equipment Replacement, Others
    description: str
    status: str = "Open"  # Open, In Progress, On Hold, Completed, Cancelled
    priority: str = "Medium"  # Critical, High, Medium, Low
    assigned_technicians: List[str] = []  # List of technician usernames
    scheduled_date: Optional[datetime] = None
    scheduled_time_slot: Optional[str] = None  # e.g., "09:00-12:00"
    materials_used: List[Dict[str, Any]] = []  # [{item_code, name, quantity, unit, unit_id (if serialized)}]
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    time_rendered_minutes: Optional[int] = None
    sla_target_hours: Optional[float] = None  # SLA target in hours based on priority
    sla_breached: bool = False

class NewAddress(BaseModel):
    province: Optional[str] = None
    municipality: Optional[str] = None
    barangay: Optional[str] = None
    street: Optional[str] = None

class JobOrderCreate(BaseModel):
    subscriber_id: str
    type: str
    description: str
    priority: str = "Medium"
    assigned_technicians: List[str] = []
    scheduled_date: Optional[datetime] = None
    scheduled_time_slot: Optional[str] = None
    notes: Optional[str] = None
    new_address: Optional[NewAddress] = None  # For relocation jobs

class JobOrderUpdate(BaseModel):
    type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_technicians: Optional[List[str]] = None
    scheduled_date: Optional[datetime] = None
    scheduled_time_slot: Optional[str] = None
    notes: Optional[str] = None

class MaterialEntry(BaseModel):
    item_code: str
    quantity: float
    unit_id: Optional[str] = None  # For serialized items

class JobOrderComplete(BaseModel):
    completion_remarks: Optional[str] = None
    equipment_unit_id: Optional[str] = None  # For Pull Out Modem / Replace Modem
    new_equipment_unit_id: Optional[str] = None  # For Replace Modem (new modem)
    mark_defective: bool = False  # For Replace Modem (mark old as defective)

class SLASettings(BaseModel):
    critical_hours: float = 2
    high_hours: float = 8
    medium_hours: float = 12
    low_hours: float = 24

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
    expense_id: Optional[str] = None
    category: str
    description: str
    amount: float
    expense_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reference_number: Optional[str] = None  # Receipt/invoice reference
    is_recurring: bool = False
    recurring_type: Optional[str] = None  # 'daily', 'weekly', 'monthly' (for display/reminder only)
    reference_type: Optional[str] = None  # 'purchase' for auto-created expenses
    reference_id: Optional[str] = None  # purchase_id for linking
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseCategory(BaseModel):
    category_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    is_preset: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CompanySettings(BaseModel):
    business_name: str = ""
    address: str = ""
    email: str = ""
    mobile: str = ""
    logo_url: Optional[str] = None
    # Extended fields
    company_logo: Optional[str] = None  # Base64 encoded image
    company_name: str = ""
    company_branch: Optional[str] = None
    company_address: str = ""
    company_mobile: str = ""
    company_email: Optional[str] = None
    company_tin: Optional[str] = None
    receipt_footer: str = "Thank you for your payment!"
    soa_footer: str = "If you have questions or concerns about this statement please contact on the details provided above."

class ReceiptSettings(BaseModel):
    company_logo: Optional[str] = None  # Base64 encoded image
    company_name: str = ""
    company_branch: Optional[str] = None  # Optional branch name
    company_address: str = ""
    company_mobile: str = ""
    company_email: Optional[str] = None
    tin_number: Optional[str] = None  # Tax Identification Number
    vat_registered: bool = False
    vat_percentage: float = 12.0
    footer_text: Optional[str] = None
    receipt_title: str = "SERVICE INVOICE"
    or_prefix: str = "OR"  # OR/SI number prefix
    paper_width: int = 48  # Paper width in mm (48mm or 58mm)
    auto_print: bool = False  # Auto print after payment

class DiscountCreate(BaseModel):
    name: str  # Label/reason (e.g., "Senior Citizen Discount")
    discount_type: str = "fixed"  # "fixed" or "percentage"
    value: float  # Amount or percentage value
    duration: str = "one-time"  # "one-time" or "recurring"
    apply_to: str = "all_active"  # "all_active", "selected_subscribers", "by_plan"
    subscriber_ids: List[str] = []  # For selected_subscribers
    plan_ids: List[str] = []  # For by_plan
    is_active: bool = True

class DiscountUpdate(BaseModel):
    name: Optional[str] = None
    discount_type: Optional[str] = None
    value: Optional[float] = None
    duration: Optional[str] = None
    apply_to: Optional[str] = None
    subscriber_ids: Optional[List[str]] = None
    plan_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None

# ========== HELPER FUNCTIONS ==========
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    """Verify password with graceful handling of unknown hash formats"""
    try:
        return pwd_context.verify(plain, hashed)
    except Exception as e:
        # Handle unknown hash formats (e.g., plain text passwords from imports)
        # Fall back to direct comparison for plain text passwords
        logger.warning(f"Password verification fallback - hash format not recognized: {str(e)}")
        return plain == hashed

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

    def update_pppoe_profile(self, username: str, new_profile: str) -> bool:
        """Update the profile of an existing PPPoE account"""
        try:
            resource = self.api.get_resource('/ppp/secret')
            secrets = resource.get()
            
            # Find the account by username
            for secret in secrets:
                if secret.get('name') == username:
                    secret_id = secret.get('id')
                    if secret_id:
                        resource.set(id=secret_id, profile=new_profile)
                        logger.info(f"Updated PPPoE profile for {username} to {new_profile}")
                        return True
            
            logger.warning(f"PPPoE account {username} not found for profile update")
            return False
        except Exception as e:
            logger.error(f"Failed to update PPPoE profile: {e}")
            return False

    def disconnect_active_session(self, username: str) -> bool:
        """Disconnect an active PPPoE session to force reconnection with new profile"""
        try:
            resource = self.api.get_resource('/ppp/active')
            active_sessions = resource.get()
            
            # Find active session by username
            for session in active_sessions:
                if session.get('name') == username:
                    session_id = session.get('id')
                    if session_id:
                        resource.remove(id=session_id)
                        logger.info(f"Disconnected active session for {username}")
                        return True
            
            logger.info(f"No active session found for {username}")
            return False  # No active session, but not an error
        except Exception as e:
            logger.error(f"Failed to disconnect session: {e}")
            return False

    def get_pppoe_account_profile(self, username: str) -> str:
        """Get the current profile of a PPPoE account"""
        try:
            resource = self.api.get_resource('/ppp/secret')
            secrets = resource.get()
            
            for secret in secrets:
                if secret.get('name') == username:
                    return secret.get('profile', '')
            return ''
        except Exception as e:
            logger.error(f"Failed to get PPPoE profile: {e}")
            return ''

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

# ========== SUBSCRIBER PORTAL ==========
class SubscriberLogin(BaseModel):
    account_number: str
    password: str

async def get_current_subscriber(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current subscriber from JWT token"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        account_number: str = payload.get("sub")
        role: str = payload.get("role")
        if account_number is None or role != "subscriber":
            raise HTTPException(status_code=401, detail="Invalid subscriber token")
        subscriber = await db.subscribers.find_one({"account_number": account_number}, {"_id": 0})
        if subscriber is None:
            raise HTTPException(status_code=401, detail="Subscriber not found")
        subscriber['role'] = 'subscriber'
        return subscriber
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@api_router.post("/subscriber/auth/login")
async def subscriber_login(data: SubscriberLogin):
    """Subscriber login using account number"""
    subscriber = await db.subscribers.find_one({"account_number": data.account_number.upper()})
    if not subscriber:
        raise HTTPException(status_code=401, detail="Account not found")
    
    # Check password - use stored password or default to last 4 digits of mobile/phone
    stored_password = subscriber.get('portal_password')
    if stored_password:
        if not verify_password(data.password, stored_password):
            raise HTTPException(status_code=401, detail="Invalid password")
    else:
        # Default password: last 4 digits of mobile or phone number
        mobile = subscriber.get('mobile') or subscriber.get('phone') or ''
        default_password = mobile[-4:] if len(mobile) >= 4 else '0000'
        if data.password != default_password:
            raise HTTPException(status_code=401, detail="Invalid password. Default is last 4 digits of your mobile number.")
    
    # Create token with subscriber role
    token = create_access_token({
        "sub": subscriber['account_number'],
        "role": "subscriber",
        "name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip()
    })
    
    return {
        "access_token": token,
        "role": "subscriber",
        "account_number": subscriber['account_number'],
        "name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip()
    }

@api_router.post("/subscriber/auth/change-password")
async def subscriber_change_password(data: dict, current_subscriber: dict = Depends(get_current_subscriber)):
    """Change subscriber portal password"""
    new_password = data.get('new_password')
    if not new_password or len(new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    
    hashed = hash_password(new_password)
    await db.subscribers.update_one(
        {"account_number": current_subscriber['account_number']},
        {"$set": {"portal_password": hashed}}
    )
    return {"message": "Password changed successfully"}


# ========== SUBSCRIBER PORTAL ADMIN MANAGEMENT ==========
@api_router.get("/admin/subscriber-portal/logins")
async def get_subscriber_portal_logins(
    current_user: dict = Depends(get_current_user),
    search: str = Query("", description="Search by account number or name"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """Get all subscribers with their portal login status"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build search query
    query = {}
    if search:
        query["$or"] = [
            {"account_number": {"$regex": search, "$options": "i"}},
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    # Get total count
    total = await db.subscribers.count_documents(query)
    
    # Get paginated subscribers
    skip = (page - 1) * limit
    subscribers = await db.subscribers.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    # Add login status info
    result = []
    for sub in subscribers:
        mobile = sub.get('mobile') or sub.get('phone') or ''
        default_pw = mobile[-4:] if len(mobile) >= 4 else '0000'
        has_custom_pw = bool(sub.get('portal_password'))
        
        result.append({
            "account_number": sub.get('account_number'),
            "first_name": sub.get('first_name'),
            "last_name": sub.get('last_name'),
            "phone": sub.get('phone'),
            "mobile": sub.get('mobile'),
            "is_active": sub.get('is_active', False),
            "has_custom_password": has_custom_pw,
            "default_password": default_pw if not has_custom_pw else None,
            "password_type": "Custom" if has_custom_pw else "Default (last 4 digits of phone)",
            "can_login": len(mobile) >= 4 or has_custom_pw
        })
    
    return {
        "subscribers": result,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }

@api_router.post("/admin/subscriber-portal/reset-password/{account_number}")
async def admin_reset_subscriber_password(
    account_number: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Admin reset subscriber portal password"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number.upper()})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    new_password = data.get('new_password')
    if not new_password or len(new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    
    # Hash and save new password
    hashed = hash_password(new_password)
    await db.subscribers.update_one(
        {"account_number": account_number.upper()},
        {"$set": {"portal_password": hashed}}
    )
    
    return {"message": f"Password reset successfully for {account_number}"}

@api_router.post("/admin/subscriber-portal/reset-to-default/{account_number}")
async def admin_reset_subscriber_to_default(
    account_number: str,
    current_user: dict = Depends(get_current_user)
):
    """Reset subscriber password to default (remove custom password)"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number.upper()})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    # Remove custom password - will use default (last 4 digits of phone)
    await db.subscribers.update_one(
        {"account_number": account_number.upper()},
        {"$unset": {"portal_password": ""}}
    )
    
    mobile = subscriber.get('mobile') or subscriber.get('phone') or ''
    default_pw = mobile[-4:] if len(mobile) >= 4 else '0000'
    
    return {
        "message": f"Password reset to default for {account_number}",
        "default_password": default_pw
    }

@api_router.post("/admin/subscriber-portal/bulk-reset")
async def admin_bulk_reset_passwords(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Bulk reset passwords for multiple subscribers"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Access denied")
    
    account_numbers = data.get('account_numbers', [])
    action = data.get('action', 'reset_to_default')  # 'reset_to_default' or 'set_custom'
    custom_password = data.get('custom_password')
    
    if not account_numbers:
        raise HTTPException(status_code=400, detail="No accounts selected")
    
    updated = 0
    for acc in account_numbers:
        subscriber = await db.subscribers.find_one({"account_number": acc.upper()})
        if subscriber:
            if action == 'reset_to_default':
                await db.subscribers.update_one(
                    {"account_number": acc.upper()},
                    {"$unset": {"portal_password": ""}}
                )
            elif action == 'set_custom' and custom_password:
                hashed = hash_password(custom_password)
                await db.subscribers.update_one(
                    {"account_number": acc.upper()},
                    {"$set": {"portal_password": hashed}}
                )
            updated += 1
    
    return {"message": f"Updated {updated} subscriber(s)", "updated_count": updated}


@api_router.get("/subscriber/dashboard")
async def get_subscriber_dashboard(current_subscriber: dict = Depends(get_current_subscriber)):
    """Get subscriber dashboard data"""
    account_number = current_subscriber['account_number']
    
    # Get unpaid invoices (payables)
    unpaid_invoices = await db.invoices.find({
        "subscriber_id": account_number,
        "paid": False
    }, {"_id": 0}).to_list(100)
    
    total_payables = sum(inv.get('amount', 0) - inv.get('paid_amount', 0) for inv in unpaid_invoices)
    
    # Get wallet balance
    wallet_balance = current_subscriber.get('wallet_balance', 0)
    
    # Get job orders
    job_orders = await db.job_orders.find({
        "subscriber_id": account_number
    }, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    open_jobs = len([j for j in job_orders if j.get('status') == 'Open'])
    completed_jobs = len([j for j in job_orders if j.get('status') == 'Completed'])
    
    # Get recent payments
    recent_payments = await db.payments.find({
        "subscriber_id": account_number
    }, {"_id": 0}).sort("payment_date", -1).to_list(10)
    
    # Get notifications
    notifications = await db.subscriber_notifications.find({
        "$or": [
            {"subscriber_id": account_number},
            {"subscriber_id": "all"}
        ]
    }, {"_id": 0}).sort("created_at", -1).to_list(20)
    
    # Check for auto-generated notifications based on status
    status_notifications = []
    
    # Determine actual status - check both 'status' field and 'is_active' field for compatibility
    subscriber_status = current_subscriber.get('status')
    is_active = current_subscriber.get('is_active', True)
    
    # If is_active is False but status isn't set, treat as deactivated
    if not is_active and subscriber_status not in ['inactive', 'deactivated']:
        subscriber_status = 'deactivated'
    
    # Default to 'active' if nothing is set
    if subscriber_status is None and is_active:
        subscriber_status = 'active'
    
    if subscriber_status == 'inactive' or subscriber_status == 'deactivated':
        status_notifications.append({
            "type": "warning",
            "title": "Account Deactivated",
            "message": f"Your account has been temporarily disconnected. Reason: {current_subscriber.get('deactivation_reason', 'Please contact support.')}",
            "created_at": get_ph_now().isoformat()
        })
    
    if total_payables > 0:
        status_notifications.append({
            "type": "billing",
            "title": "Outstanding Balance",
            "message": f"You have an outstanding balance of ₱{total_payables:,.2f}. Please settle to avoid service interruption.",
            "created_at": get_ph_now().isoformat()
        })
    
    # Add wallet credit notification if has balance
    if wallet_balance > 0:
        status_notifications.append({
            "type": "info",
            "title": "Wallet Credit Available",
            "message": f"You have ₱{wallet_balance:,.2f} wallet credit that will be automatically applied to your next bill.",
            "created_at": get_ph_now().isoformat()
        })
    
    return {
        "subscriber": {
            "account_number": current_subscriber['account_number'],
            "name": f"{current_subscriber.get('first_name', '')} {current_subscriber.get('last_name', '')}".strip(),
            "plan": current_subscriber.get('plan_name', current_subscriber.get('plan', {}).get('name', 'N/A')),
            "status": subscriber_status,
            "address": current_subscriber.get('address', ''),
            "mobile": current_subscriber.get('mobile', ''),
            "email": current_subscriber.get('email', ''),
            "installation_date": current_subscriber.get('installation_date'),
            "billing_day": current_subscriber.get('billing_day', 1),
            "wallet_balance": wallet_balance,
            "deactivation_reason": current_subscriber.get('deactivation_reason', '')
        },
        "payables": {
            "total": total_payables,
            "invoice_count": len(unpaid_invoices)
        },
        "wallet": {
            "balance": wallet_balance
        },
        "job_orders": {
            "open": open_jobs,
            "completed": completed_jobs,
            "total": len(job_orders)
        },
        "recent_payments": recent_payments[:5],
        "notifications": status_notifications + notifications
    }

@api_router.get("/subscriber/invoices")
async def get_subscriber_invoices(current_subscriber: dict = Depends(get_current_subscriber)):
    """Get all invoices for subscriber"""
    invoices = await db.invoices.find({
        "subscriber_id": current_subscriber['account_number']
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    return invoices

@api_router.get("/subscriber/payments")
async def get_subscriber_payments(current_subscriber: dict = Depends(get_current_subscriber)):
    """Get payment history for subscriber"""
    payments = await db.payments.find({
        "subscriber_id": current_subscriber['account_number']
    }, {"_id": 0}).sort("payment_date", -1).to_list(100)
    return payments

@api_router.get("/subscriber/job-orders")
async def get_subscriber_job_orders(current_subscriber: dict = Depends(get_current_subscriber)):
    """Get job orders for subscriber"""
    job_orders = await db.job_orders.find({
        "subscriber_id": current_subscriber['account_number']
    }, {"_id": 0}).sort("created_at", -1).to_list(50)
    return job_orders

# ========== SUBSCRIBER CHAT SUPPORT ==========
@api_router.get("/subscriber/chat/tickets")
async def get_subscriber_chat_tickets(current_subscriber: dict = Depends(get_current_subscriber)):
    """Get chat support tickets for subscriber"""
    tickets = await db.support_tickets.find({
        "subscriber_id": current_subscriber['account_number']
    }, {"_id": 0}).sort("updated_at", -1).to_list(50)
    return tickets

@api_router.post("/subscriber/chat/tickets")
async def create_support_ticket(data: dict, current_subscriber: dict = Depends(get_current_subscriber)):
    """Create a new support ticket"""
    ticket_id = f"TKT{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}"
    
    ticket = {
        "ticket_id": ticket_id,
        "subscriber_id": current_subscriber['account_number'],
        "subscriber_name": f"{current_subscriber.get('first_name', '')} {current_subscriber.get('last_name', '')}".strip(),
        "subject": data.get('subject', 'Support Request'),
        "category": data.get('category', 'general'),
        "status": "open",
        "messages": [{
            "sender": "subscriber",
            "sender_name": f"{current_subscriber.get('first_name', '')} {current_subscriber.get('last_name', '')}".strip(),
            "message": data.get('message', ''),
            "timestamp": get_ph_now().isoformat()
        }],
        "created_at": get_ph_now().isoformat(),
        "updated_at": get_ph_now().isoformat()
    }
    
    await db.support_tickets.insert_one(ticket)
    ticket.pop('_id', None)
    return ticket

@api_router.post("/subscriber/chat/tickets/{ticket_id}/message")
async def send_ticket_message(ticket_id: str, data: dict, current_subscriber: dict = Depends(get_current_subscriber)):
    """Send a message to a support ticket"""
    ticket = await db.support_tickets.find_one({
        "ticket_id": ticket_id,
        "subscriber_id": current_subscriber['account_number']
    })
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    message = {
        "sender": "subscriber",
        "sender_name": f"{current_subscriber.get('first_name', '')} {current_subscriber.get('last_name', '')}".strip(),
        "message": data.get('message', ''),
        "timestamp": get_ph_now().isoformat()
    }
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {
            "$push": {"messages": message},
            "$set": {"updated_at": get_ph_now().isoformat(), "status": "open"}
        }
    )
    
    return {"message": "Message sent", "data": message}

@api_router.get("/subscriber/chat/tickets/{ticket_id}")
async def get_ticket_details(ticket_id: str, current_subscriber: dict = Depends(get_current_subscriber)):
    """Get ticket details with messages"""
    ticket = await db.support_tickets.find_one({
        "ticket_id": ticket_id,
        "subscriber_id": current_subscriber['account_number']
    }, {"_id": 0})
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return ticket

# Admin endpoint to reply to tickets
@api_router.post("/admin/support/tickets/{ticket_id}/reply")
async def admin_reply_ticket(ticket_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Admin reply to support ticket"""
    if current_user['role'] not in ['admin', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    message = {
        "sender": "support",
        "sender_name": current_user['username'],
        "message": data.get('message', ''),
        "timestamp": get_ph_now().isoformat()
    }
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {
            "$push": {"messages": message},
            "$set": {
                "updated_at": get_ph_now().isoformat(),
                "status": data.get('status', 'in_progress')
            }
        }
    )
    
    return {"message": "Reply sent", "data": message}

@api_router.get("/admin/support/tickets")
async def get_all_support_tickets(current_user: dict = Depends(get_current_user)):
    """Get all support tickets (admin)"""
    if current_user['role'] not in ['admin', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    tickets = await db.support_tickets.find({}, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return tickets

# ========== SUBSCRIBER NOTIFICATIONS (Admin Management) ==========
@api_router.post("/admin/notifications/broadcast")
async def broadcast_notification(data: dict, current_user: dict = Depends(get_current_user)):
    """Broadcast notification to all subscribers or specific ones"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    notification = {
        "notification_id": f"NOTIF{str(uuid.uuid4())[:8].upper()}",
        "subscriber_id": data.get('subscriber_id', 'all'),  # 'all' for broadcast
        "type": data.get('type', 'info'),  # info, warning, billing, maintenance
        "title": data.get('title', ''),
        "message": data.get('message', ''),
        "created_at": get_ph_now().isoformat(),
        "created_by": current_user['username'],
        "read": False
    }
    
    await db.subscriber_notifications.insert_one(notification)
    notification.pop('_id', None)
    return notification

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
        # Return empty stats if not configured (graceful for production)
        return {
            "cpu_load": 0,
            "memory_used": 0,
            "memory_free": 0,
            "uptime": "N/A",
            "active_clients": [],
            "connection_status": "not_configured"
        }
    
    try:
        service = MikrotikService(config)
        if service.connect():
            stats = service.get_resource_stats()
            active_clients = service.get_active_clients()
            service.disconnect()
            stats['active_clients'] = active_clients
            stats['connection_status'] = "connected"
            return stats
    except Exception as e:
        logger.error(f"Mikrotik connection failed: {str(e)}")
    
    # Return empty stats on connection failure (graceful for production)
    return {
        "cpu_load": 0,
        "memory_used": 0,
        "memory_free": 0,
        "uptime": "N/A",
        "active_clients": [],
        "connection_status": "disconnected"
    }

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
    
    # Connect to Mikrotik
    service = MikrotikService(mikrotik_config)
    if service.connect():
        # First, check if the PPPoE account already exists
        account_exists = service.pppoe_account_exists(subscriber['pppoe_username'])
        
        if account_exists:
            # Account already exists in Mikrotik - just update our database status
            service.disconnect()
            await db.subscribers.update_one(
                {"account_number": account_number},
                {"$set": {"pppoe_activated": True}}
            )
            return {
                "message": f"PPPoE account '{subscriber['pppoe_username']}' already exists in Mikrotik. Status updated to Active.",
                "success": True,
                "already_exists": True
            }
        
        # Account doesn't exist, create it
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
            return {"message": "PPPoE account created and activated in Mikrotik", "success": True, "already_exists": False}
        raise HTTPException(status_code=500, detail="Failed to create PPPoE account in Mikrotik")
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
    # Build full address for job order
    address_parts = [
        subscriber.street,
        subscriber.barangay,
        subscriber.municipality,
        subscriber.province
    ]
    full_address = ', '.join(filter(None, address_parts)) or subscriber.address or ''
    
    job = {
        "job_order_id": f"JO{datetime.now().strftime('%Y%m%d')}{uuid.uuid4().hex[:6].upper()}",
        "subscriber_id": subscriber.account_number,
        "subscriber_name": f"{subscriber.first_name} {subscriber.last_name}",
        "subscriber_address": full_address,
        "type": "Installation",
        "description": f"New installation for {subscriber.first_name} {subscriber.last_name}",
        "status": "Open",
        "priority": "High",
        "assigned_technicians": [],
        "scheduled_date": None,
        "scheduled_time_slot": "",
        "notes": "",
        "materials_used": [],
        "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc),
        "sla_target_hours": 8,
        "sla_breached": False
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
    """Get all equipment and materials assigned to a subscriber"""
    items_list = []
    
    # Get serialized equipment from inventory_units (assigned during registration)
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
        unit['assigned_via'] = unit.get('assigned_via', 'registration')
        unit['item_type'] = 'equipment'  # Serialized equipment
        items_list.append(unit)
    
    # Get serialized equipment from subscriber_equipment (assigned via job orders)
    job_order_equipment = await db.subscriber_equipment.find(
        {"account_number": account_number},
        {"_id": 0}
    ).to_list(100)
    
    # Add job order equipment (avoid duplicates based on unit_id)
    existing_unit_ids = {e.get('unit_id') for e in items_list if e.get('unit_id')}
    for equip in job_order_equipment:
        if equip.get('unit_id') not in existing_unit_ids:
            equip['item_type'] = 'equipment'
            items_list.append(equip)
    
    # Get ALL materials used from job orders for this subscriber (including non-serialized)
    job_orders = await db.job_orders.find(
        {"subscriber_id": account_number, "materials_used": {"$exists": True, "$ne": []}},
        {"_id": 0, "job_order_id": 1, "materials_used": 1, "type": 1, "completed_at": 1}
    ).to_list(100)
    
    # Add non-serialized materials from job orders
    for jo in job_orders:
        for mat in jo.get('materials_used', []):
            # Skip if it's a serialized item (already added above)
            if mat.get('unit_id'):
                continue
            
            material_entry = {
                'item_code': mat.get('item_code'),
                'item_name': mat.get('name'),
                'quantity': mat.get('quantity'),
                'unit': mat.get('unit'),
                'item_type': 'material',  # Non-serialized material
                'assigned_via': 'job_order',
                'job_order_id': jo.get('job_order_id'),
                'job_order_type': jo.get('type'),
                'assigned_date': mat.get('added_at') or jo.get('completed_at'),
                'added_by': mat.get('added_by')
            }
            items_list.append(material_entry)
    
    return items_list

@api_router.get("/payments/today-stats")
async def get_today_payment_stats(current_user: dict = Depends(get_current_user)):
    """
    Get payment statistics for today.
    For cashiers, only show their own collections.
    For admins/billing, show all collections.
    """
    if current_user['role'] not in ['admin', 'cashier', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get start of today in Philippine timezone
    ph_now = get_ph_now()
    today_start = ph_now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Build match filter
    match_filter = {"payment_date": {"$gte": today_start}}
    
    # For cashiers, only show their own collections
    if current_user['role'] == 'cashier':
        match_filter["received_by"] = current_user['username']
    
    # Count and sum today's payments - handle both legacy 'amount' and centralized 'total_amount'
    pipeline = [
        {"$match": match_filter},
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
            "date": today_start.strftime("%Y-%m-%d"),
            "filtered_by": current_user['username'] if current_user['role'] == 'cashier' else "all"
        }
    else:
        return {
            "total": 0,
            "count": 0,
            "date": today_start.strftime("%Y-%m-%d"),
            "filtered_by": current_user['username'] if current_user['role'] == 'cashier' else "all"
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
                "due_date": now + timedelta(days=5),
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
                    "due_date": now + timedelta(days=5),
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
    
    # Update PPPoE profile on Mikrotik to disconnection profile and disconnect active session
    mikrotik_config = await db.mikrotik_configs.find_one({})
    if mikrotik_config and subscriber.get('pppoe_username'):
        try:
            service = MikrotikService(mikrotik_config)
            if service.connect():
                # Update profile to DEACTIVATED
                profile_updated = service.update_pppoe_profile(subscriber['pppoe_username'], disconnection_profile)
                if profile_updated:
                    response["mikrotik_profile_changed"] = disconnection_profile
                    
                    # Disconnect active session so new profile takes effect immediately
                    session_disconnected = service.disconnect_active_session(subscriber['pppoe_username'])
                    if session_disconnected:
                        response["active_session_disconnected"] = True
                    else:
                        response["active_session_disconnected"] = False
                        response["session_note"] = "No active session found or already disconnected"
                else:
                    response["mikrotik_error"] = "Failed to update PPPoE profile"
                service.disconnect()
        except Exception as e:
            logger.error(f"Failed to update Mikrotik profile: {e}")
            response["mikrotik_error"] = str(e)
    
    # Update subscriber status
    await db.subscribers.update_one(
        {"account_number": account_number},
        {"$set": {
            "is_active": False,
            "status": "deactivated",
            "deactivated_at": now,
            "deactivation_reason": reason,
            "previous_pppoe_profile": subscriber.get('pppoe_profile'),
            "pppoe_profile": disconnection_profile,
            "pppoe_activated": False
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
                    "due_date": now + timedelta(days=5),
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
    
    # Update PPPoE profile on Mikrotik and disconnect active session
    mikrotik_config = await db.mikrotik_configs.find_one({})
    if mikrotik_config and subscriber.get('pppoe_username'):
        try:
            service = MikrotikService(mikrotik_config)
            if service.connect():
                # Update profile to the new selected profile
                profile_updated = service.update_pppoe_profile(subscriber['pppoe_username'], new_profile)
                if profile_updated:
                    response["mikrotik_profile_changed"] = new_profile
                    
                    # Disconnect active session so new profile takes effect immediately
                    session_disconnected = service.disconnect_active_session(subscriber['pppoe_username'])
                    if session_disconnected:
                        response["active_session_disconnected"] = True
                    else:
                        response["active_session_disconnected"] = False
                        response["session_note"] = "No active session found - subscriber will use new profile on next connection"
                else:
                    response["mikrotik_error"] = "Failed to update PPPoE profile"
                service.disconnect()
        except Exception as e:
            logger.error(f"Failed to update Mikrotik profile: {e}")
            response["mikrotik_error"] = str(e)
    
    # Update subscriber status
    await db.subscribers.update_one(
        {"account_number": account_number},
        {"$set": {
            "is_active": True,
            "status": "active",
            "reactivated_at": now,
            "pppoe_profile": new_profile,
            "plan_id": new_plan_id,
            "pppoe_activated": True
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
        "due_date": now + timedelta(days=5),
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
    - Supports discounts/rebates
    """
    if current_user['role'] not in ['admin', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber_id = data.get('subscriber_id')
    amount = float(data.get('amount', 0))
    mode = data.get('mode', 'cash')
    applied_discounts = data.get('applied_discounts', [])  # List of {discount_id, discount_amount}
    
    if not subscriber_id or amount <= 0:
        raise HTTPException(status_code=400, detail="Subscriber ID and amount required")
    
    subscriber = await db.subscribers.find_one({"account_number": subscriber_id})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    now = datetime.now(timezone.utc)
    or_number = f"OR{now.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}"
    
    # Calculate total discount amount
    total_discount = sum(d.get('discount_amount', 0) for d in applied_discounts)
    
    # Get all unpaid invoices sorted by creation date (oldest first)
    unpaid_invoices = await db.invoices.find({
        "subscriber_id": subscriber_id,
        "paid": False
    }).sort("created_at", 1).to_list(100)
    
    # The effective payment covers the original bill minus discounts
    # But the amount tendered by customer is 'amount'
    # So total_covered = amount + total_discount (discount reduces what customer needs to pay)
    amount_to_allocate = amount + total_discount
    
    remaining_amount = amount_to_allocate
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
        "total_amount": amount,  # Amount actually paid by customer
        "total_discount": total_discount,  # Total discount applied
        "original_amount": amount + total_discount,  # Original bill amount before discount
        "applied_discounts": applied_discounts,  # Details of each discount
        "mode": mode,
        "payment_mode": mode,  # Also store as payment_mode for consistency
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
    
    # Update discount usage stats
    for disc in applied_discounts:
        discount_id = disc.get('discount_id')
        discount_amount = disc.get('discount_amount', 0)
        if discount_id and discount_amount > 0:
            await db.discounts.update_one(
                {"discount_id": discount_id},
                {
                    "$inc": {
                        "times_used": 1,
                        "total_amount_discounted": discount_amount
                    }
                }
            )
            
            # For one-time discounts, track usage per subscriber
            discount_doc = await db.discounts.find_one({"discount_id": discount_id})
            if discount_doc and discount_doc.get('duration') == 'one-time':
                await db.discount_usage.insert_one({
                    "discount_id": discount_id,
                    "subscriber_id": subscriber_id,
                    "used_at": now,
                    "or_number": or_number,
                    "amount": discount_amount
                })
    
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
        "total_discount": total_discount,
        "original_amount": amount + total_discount,
        "applied_discounts": applied_discounts,
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


@api_router.post("/admin/apply-wallet-credits/{account_number}")
async def admin_apply_wallet_credits(
    account_number: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Admin endpoint to manually apply wallet credits to unpaid invoices.
    This is useful for fixing existing subscribers who have wallet balance
    but unpaid invoices that weren't auto-paid.
    """
    if current_user['role'] not in ['admin', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number.upper()})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    wallet_balance = subscriber.get('wallet_balance', 0)
    if wallet_balance <= 0:
        return {"message": "No wallet balance to apply", "invoices_paid": 0, "amount_applied": 0}
    
    # Get unpaid invoices sorted by due_date (oldest first)
    unpaid_invoices = await db.invoices.find({
        "subscriber_id": account_number.upper(),
        "paid": False
    }).sort("due_date", 1).to_list(100)
    
    if not unpaid_invoices:
        return {"message": "No unpaid invoices found", "invoices_paid": 0, "amount_applied": 0}
    
    total_applied = 0
    invoices_fully_paid = 0
    invoices_partially_paid = 0
    now = datetime.now(timezone.utc)
    
    remaining_wallet = wallet_balance
    
    for invoice in unpaid_invoices:
        if remaining_wallet <= 0:
            break
        
        invoice_amount = invoice.get('amount', 0)
        already_paid = invoice.get('paid_amount', 0)
        remaining_balance = invoice_amount - already_paid
        
        if remaining_balance <= 0:
            continue
        
        amount_to_apply = min(remaining_wallet, remaining_balance)
        new_paid_amount = already_paid + amount_to_apply
        
        if new_paid_amount >= invoice_amount:
            # Fully paid
            await db.invoices.update_one(
                {"invoice_number": invoice['invoice_number']},
                {"$set": {"paid": True, "paid_amount": invoice_amount, "paid_at": now}}
            )
            invoices_fully_paid += 1
        else:
            # Partially paid
            await db.invoices.update_one(
                {"invoice_number": invoice['invoice_number']},
                {"$set": {"paid_amount": new_paid_amount}}
            )
            invoices_partially_paid += 1
        
        total_applied += amount_to_apply
        remaining_wallet -= amount_to_apply
        
        # Log the transaction
        await db.wallet_transactions.insert_one({
            "subscriber_id": account_number.upper(),
            "type": "debit",
            "amount": amount_to_apply,
            "description": f"Manual wallet apply for {invoice['invoice_number']}",
            "created_at": now
        })
    
    # Update subscriber's wallet balance
    await db.subscribers.update_one(
        {"account_number": account_number.upper()},
        {"$set": {"wallet_balance": remaining_wallet}}
    )
    
    return {
        "message": f"Successfully applied wallet credits",
        "amount_applied": total_applied,
        "invoices_fully_paid": invoices_fully_paid,
        "invoices_partially_paid": invoices_partially_paid,
        "remaining_wallet": remaining_wallet,
        "original_wallet": wallet_balance
    }

@api_router.post("/admin/apply-all-wallet-credits")
async def admin_apply_all_wallet_credits(current_user: dict = Depends(get_current_user)):
    """
    Admin endpoint to apply wallet credits for ALL subscribers with both:
    - Positive wallet balance
    - Unpaid invoices
    """
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Find subscribers with wallet balance
    subscribers_with_wallet = await db.subscribers.find({
        "wallet_balance": {"$gt": 0}
    }).to_list(10000)
    
    total_subscribers_processed = 0
    total_amount_applied = 0
    total_invoices_paid = 0
    
    for sub in subscribers_with_wallet:
        account_number = sub['account_number']
        
        # Check if they have unpaid invoices
        unpaid_count = await db.invoices.count_documents({
            "subscriber_id": account_number,
            "paid": False
        })
        
        if unpaid_count > 0:
            # Apply wallet credits
            result = await admin_apply_wallet_credits(account_number, current_user)
            if result.get('amount_applied', 0) > 0:
                total_subscribers_processed += 1
                total_amount_applied += result['amount_applied']
                total_invoices_paid += result['invoices_fully_paid']
    
    return {
        "message": "Bulk wallet application complete",
        "subscribers_processed": total_subscribers_processed,
        "total_amount_applied": total_amount_applied,
        "total_invoices_paid": total_invoices_paid
    }


@api_router.get("/payments/subscriber/{account_number}")
async def get_subscriber_payments(
    account_number: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get subscriber payment history with optional date range filter"""
    query = {"subscriber_id": account_number}
    
    # Add date range filter if provided
    if start_date or end_date:
        date_filter = {}
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                # Set to start of day
                start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
                date_filter["$gte"] = start_dt
            except ValueError:
                pass
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                # Set to end of day
                end_dt = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
                date_filter["$lte"] = end_dt
            except ValueError:
                pass
        if date_filter:
            query["payment_date"] = date_filter
    
    payments = await db.payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    return payments


@api_router.post("/subscribers/{account_number}/wallet")
async def add_wallet_credit(account_number: str, data: dict, current_user: dict = Depends(get_current_user)):
    """
    Add advance payment directly to subscriber's wallet credit.
    Used when subscriber has no outstanding invoices but wants to pay in advance.
    """
    if current_user['role'] not in ['admin', 'cashier', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    amount = float(data.get('amount', 0))
    mode = data.get('mode', 'cash')
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    
    subscriber = await db.subscribers.find_one({"account_number": account_number})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    now = datetime.now(timezone.utc)
    or_number = f"OR{now.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}"
    
    # Update subscriber wallet
    current_wallet = subscriber.get('wallet_balance', 0)
    new_wallet = current_wallet + amount
    
    await db.subscribers.update_one(
        {"account_number": account_number},
        {"$set": {"wallet_balance": new_wallet}}
    )
    
    # Log wallet credit transaction
    await db.wallet_transactions.insert_one({
        "subscriber_id": account_number,
        "type": "credit",
        "amount": amount,
        "description": f"Advance payment deposit - OR# {or_number}",
        "or_number": or_number,
        "created_at": now
    })
    
    # Create payment record for audit trail
    payment_record = {
        "or_number": or_number,
        "subscriber_id": account_number,
        "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip(),
        "total_amount": amount,
        "mode": mode,
        "payment_date": now,
        "received_by": current_user['username'],
        "invoices_settled": [],
        "invoices_partial": [],
        "description": "Advance payment - Wallet deposit",
        "wallet_credit": amount,
        "is_advance_payment": True
    }
    await db.payments.insert_one(payment_record)
    
    return {
        "message": "Wallet credit added successfully",
        "or_number": or_number,
        "amount_added": amount,
        "previous_balance": current_wallet,
        "new_balance": new_wallet
    }

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


@api_router.get("/soa/{account_number}")
async def generate_soa(
    account_number: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate Statement of Account (SOA) PDF for a subscriber"""
    subscriber = await db.subscribers.find_one({"account_number": account_number.upper()}, {"_id": 0})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    company = await db.company_settings.find_one({}, {"_id": 0})
    
    # Get unpaid invoices
    unpaid_invoices = await db.invoices.find({
        "subscriber_id": account_number.upper(),
        "paid": False
    }).sort("due_date", 1).to_list(100)
    
    # Get recent payments
    recent_payments = await db.payments.find({
        "subscriber_id": account_number.upper()
    }).sort("payment_date", -1).limit(5).to_list(5)
    
    # Calculate totals
    total_previous = sum(inv.get('paid_amount', 0) for inv in unpaid_invoices)
    total_payments = sum(p.get('total_amount', p.get('amount', 0)) for p in recent_payments)
    total_current = sum(inv.get('amount', 0) - inv.get('paid_amount', 0) for inv in unpaid_invoices)
    total_due = total_current
    
    # Get plan info
    plan = None
    if subscriber.get('plan_id'):
        plan = await db.plans.find_one({"name": subscriber['plan_id']}, {"_id": 0})
    
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    y = height - 0.5*inch
    
    # Company Header with Logo
    if company:
        logo_data = company.get('company_logo') or company.get('logo_url')
        if logo_data and logo_data.startswith('data:image'):
            try:
                import base64
                from PIL import Image as PILImage
                header = logo_data.split(',')[0]
                img_data = base64.b64decode(logo_data.split(',')[1])
                img_buffer = BytesIO(img_data)
                img = PILImage.open(img_buffer)
                img_path = f"/tmp/logo_{account_number}.png"
                img.save(img_path)
                p.drawImage(img_path, 0.5*inch, y - 0.8*inch, width=1*inch, height=1*inch, preserveAspectRatio=True)
            except Exception as e:
                logger.error(f"Failed to load logo: {e}")
        
        # Company name and details
        p.setFont("Helvetica-Bold", 14)
        company_name = company.get('company_name') or company.get('business_name', 'Billing System')
        p.drawString(1.7*inch, y - 0.2*inch, company_name)
        
        p.setFont("Helvetica", 9)
        company_address = company.get('company_address') or company.get('address', '')
        p.drawString(1.7*inch, y - 0.4*inch, company_address)
        
        contact_line = []
        if company.get('company_mobile') or company.get('mobile'):
            contact_line.append(company.get('company_mobile') or company.get('mobile'))
        if company.get('company_email') or company.get('email'):
            contact_line.append(company.get('company_email') or company.get('email'))
        p.drawString(1.7*inch, y - 0.55*inch, " | ".join(contact_line))
    
    # STATEMENT OF ACCOUNT Title
    y -= 1.3*inch
    p.setFont("Helvetica-Bold", 16)
    p.drawCentredString(width/2, y, "STATEMENT OF ACCOUNT")
    
    # Customer Details Box
    y -= 0.5*inch
    p.setStrokeColor(colors.black)
    p.setLineWidth(0.5)
    p.rect(0.5*inch, y - 1*inch, 3.5*inch, 1*inch)
    
    p.setFont("Helvetica-Bold", 10)
    p.drawString(0.6*inch, y - 0.2*inch, "Customer Details")
    p.setFont("Helvetica", 9)
    customer_name = f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip()
    p.drawString(0.6*inch, y - 0.4*inch, customer_name)
    address = subscriber.get('address', subscriber.get('barangay', ''))
    p.drawString(0.6*inch, y - 0.55*inch, address[:50] if address else '')
    phone = subscriber.get('phone') or subscriber.get('mobile', '')
    p.drawString(0.6*inch, y - 0.7*inch, phone)
    p.drawString(0.6*inch, y - 0.85*inch, subscriber.get('email', ''))
    
    # Bill Information Box
    p.rect(4.2*inch, y - 1*inch, 3.3*inch, 1*inch)
    p.setFont("Helvetica-Bold", 10)
    p.drawString(4.3*inch, y - 0.2*inch, "Bill Information")
    p.setFont("Helvetica", 9)
    
    now = datetime.now()
    billing_period = f"{now.strftime('%B')} {now.year}"
    p.drawString(4.3*inch, y - 0.4*inch, f"Billing Period: {billing_period}")
    p.drawString(4.3*inch, y - 0.55*inch, f"Account No.: {account_number.upper()}")
    tin = company.get('company_tin', '') if company else ''
    p.drawString(4.3*inch, y - 0.7*inch, f"TIN No.: {tin}")
    p.drawString(4.3*inch, y - 0.85*inch, f"Date Generated: {now.strftime('%Y-%m-%d')}")
    
    # Bill Description Section
    y -= 1.4*inch
    p.setFont("Helvetica-Bold", 11)
    p.drawString(0.5*inch, y, "Bill Description")
    
    # Previous Bill Charges
    y -= 0.35*inch
    p.setFillColor(colors.Color(0.9, 0.9, 0.9))
    p.rect(0.5*inch, y - 0.25*inch, width - 1*inch, 0.35*inch, fill=True, stroke=False)
    p.setFillColor(colors.black)
    p.setFont("Helvetica-Bold", 10)
    p.drawString(0.6*inch, y - 0.15*inch, "Previous Bill Charges")
    
    y -= 0.5*inch
    p.setFont("Helvetica", 9)
    
    # Table header
    p.drawString(0.6*inch, y, "Description")
    p.drawRightString(width - 0.6*inch, y, "Amount")
    
    y -= 0.25*inch
    p.line(0.5*inch, y + 0.1*inch, width - 0.5*inch, y + 0.1*inch)
    
    # Previous balance info
    previous_balance = sum(inv.get('amount', 0) for inv in unpaid_invoices if inv.get('is_prorated', False) or (inv.get('created_at') and inv['created_at'].month < now.month))
    
    p.drawString(0.6*inch, y, "Amount Due as of Last Statement")
    p.drawRightString(width - 0.6*inch, y, f"₱{previous_balance:,.2f}")
    
    y -= 0.25*inch
    p.drawString(0.6*inch, y, "Payments Received - Thank You!")
    p.drawRightString(width - 0.6*inch, y, f"(₱{total_payments:,.2f})")
    
    y -= 0.25*inch
    remaining = max(0, previous_balance - total_payments)
    p.drawString(0.6*inch, y, "Remaining Balance")
    p.drawRightString(width - 0.6*inch, y, f"₱{remaining:,.2f}")
    
    # Current Bill Charges
    y -= 0.4*inch
    p.setFillColor(colors.Color(0.9, 0.9, 0.9))
    p.rect(0.5*inch, y - 0.25*inch, width - 1*inch, 0.35*inch, fill=True, stroke=False)
    p.setFillColor(colors.black)
    p.setFont("Helvetica-Bold", 10)
    p.drawString(0.6*inch, y - 0.15*inch, "Current Bill Charges")
    
    y -= 0.5*inch
    p.setFont("Helvetica", 9)
    
    # List unpaid invoices
    for inv in unpaid_invoices[:5]:
        desc = inv.get('description', inv.get('plan_name', 'Monthly Service'))[:40]
        amount = inv.get('amount', 0) - inv.get('paid_amount', 0)
        p.drawString(0.6*inch, y, desc)
        p.drawRightString(width - 0.6*inch, y, f"₱{amount:,.2f}")
        y -= 0.25*inch
    
    # Total line
    y -= 0.15*inch
    p.line(0.5*inch, y + 0.1*inch, width - 0.5*inch, y + 0.1*inch)
    y -= 0.1*inch
    p.setFont("Helvetica-Bold", 11)
    p.drawString(0.6*inch, y, "TOTAL AMOUNT DUE")
    p.drawRightString(width - 0.6*inch, y, f"₱{total_due:,.2f}")
    
    # Due date
    if unpaid_invoices and unpaid_invoices[0].get('due_date'):
        due_date = unpaid_invoices[0]['due_date']
        if isinstance(due_date, datetime):
            due_str = due_date.strftime('%B %d, %Y')
        else:
            due_str = str(due_date)
        y -= 0.3*inch
        p.setFont("Helvetica", 9)
        p.drawString(0.6*inch, y, f"Due Date: {due_str}")
    
    # Footer message
    y -= 0.6*inch
    p.setFont("Helvetica", 8)
    footer = company.get('soa_footer', 'If you have questions or concerns about this statement please contact on the details provided above.') if company else ''
    
    # Word wrap footer
    words = footer.split()
    line = ""
    max_width = width - 1*inch
    for word in words:
        test_line = line + " " + word if line else word
        if p.stringWidth(test_line, "Helvetica", 8) < max_width:
            line = test_line
        else:
            p.drawString(0.5*inch, y, line)
            y -= 0.15*inch
            line = word
    if line:
        p.drawString(0.5*inch, y, line)
    
    # Thank you
    y -= 0.4*inch
    p.setFont("Helvetica-Bold", 12)
    p.drawCentredString(width/2, y, "Thank you!")
    
    p.showPage()
    p.save()
    buffer.seek(0)
    
    return StreamingResponse(buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=SOA_{account_number}_{now.strftime('%Y%m%d')}.pdf"
    })

@api_router.get("/soa-data/{account_number}")
async def get_soa_data(
    account_number: str,
    current_user: dict = Depends(get_current_user)
):
    """Get SOA data for frontend rendering"""
    subscriber = await db.subscribers.find_one({"account_number": account_number.upper()}, {"_id": 0})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    company = await db.company_settings.find_one({}, {"_id": 0})
    
    unpaid_invoices = await db.invoices.find({
        "subscriber_id": account_number.upper(),
        "paid": False
    }).sort("due_date", 1).to_list(100)
    
    recent_payments = await db.payments.find({
        "subscriber_id": account_number.upper()
    }).sort("payment_date", -1).limit(10).to_list(10)
    
    # Serialize dates
    for inv in unpaid_invoices:
        for key in ['due_date', 'created_at', 'billing_start', 'billing_end']:
            if inv.get(key) and isinstance(inv[key], datetime):
                inv[key] = inv[key].isoformat()
    
    for pmt in recent_payments:
        for key in ['payment_date', 'created_at']:
            if pmt.get(key) and isinstance(pmt[key], datetime):
                pmt[key] = pmt[key].isoformat()
    
    total_due = sum(inv.get('amount', 0) - inv.get('paid_amount', 0) for inv in unpaid_invoices)
    total_payments = sum(p.get('total_amount', p.get('amount', 0)) for p in recent_payments)
    
    return {
        "subscriber": subscriber,
        "company": company,
        "unpaid_invoices": unpaid_invoices,
        "recent_payments": recent_payments,
        "total_due": total_due,
        "total_payments": total_payments,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }


# ========== JOB ORDERS ==========
def generate_job_order_id():
    """Generate a unique job order ID"""
    return f"JO{datetime.now().strftime('%Y%m%d')}{uuid.uuid4().hex[:6].upper()}"

def get_sla_hours(priority: str, sla_settings: dict) -> float:
    """Get SLA target hours based on priority"""
    mapping = {
        "Critical": sla_settings.get("critical_hours", 2),
        "High": sla_settings.get("high_hours", 8),
        "Medium": sla_settings.get("medium_hours", 12),
        "Low": sla_settings.get("low_hours", 24)
    }
    return mapping.get(priority, 24)

@api_router.get("/joborders")
async def list_job_orders(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    technician: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all job orders with optional filters"""
    query = {}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if technician:
        query["assigned_technicians"] = technician
    
    job_orders = await db.job_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Check SLA breach for each job order
    sla_settings = await db.settings.find_one({"type": "sla"}, {"_id": 0}) or {}
    now = datetime.now(timezone.utc)
    
    for jo in job_orders:
        if jo.get("status") not in ["Completed", "Cancelled"]:
            created_at = jo.get("created_at")
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if created_at:
                # Ensure created_at is timezone-aware
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                sla_hours = jo.get("sla_target_hours") or get_sla_hours(jo.get("priority", "Medium"), sla_settings)
                elapsed_hours = (now - created_at).total_seconds() / 3600
                jo["sla_breached"] = elapsed_hours > sla_hours
                jo["elapsed_hours"] = round(elapsed_hours, 2)
    
    return job_orders

@api_router.get("/joborders/stats")
async def get_job_order_stats(current_user: dict = Depends(get_current_user)):
    """Get job order statistics for dashboard"""
    job_orders = await db.job_orders.find({}, {"_id": 0}).to_list(10000)
    
    # Count by status
    status_counts = {"Open": 0, "In Progress": 0, "On Hold": 0, "Completed": 0, "Cancelled": 0}
    priority_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    sla_breached_count = 0
    total_time_rendered = 0
    completed_count = 0
    
    sla_settings = await db.settings.find_one({"type": "sla"}, {"_id": 0}) or {}
    now = datetime.now(timezone.utc)
    
    for jo in job_orders:
        status = jo.get("status", "Open")
        if status in status_counts:
            status_counts[status] += 1
        
        priority = jo.get("priority", "Medium")
        if priority in priority_counts:
            priority_counts[priority] += 1
        
        # Check SLA breach
        if status not in ["Completed", "Cancelled"]:
            created_at = jo.get("created_at")
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if created_at:
                # Ensure created_at is timezone-aware
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                sla_hours = jo.get("sla_target_hours") or get_sla_hours(priority, sla_settings)
                elapsed_hours = (now - created_at).total_seconds() / 3600
                if elapsed_hours > sla_hours:
                    sla_breached_count += 1
        
        # Time rendered for completed jobs
        if status == "Completed" and jo.get("time_rendered_minutes"):
            total_time_rendered += jo.get("time_rendered_minutes", 0)
            completed_count += 1
    
    avg_time_rendered = round(total_time_rendered / completed_count, 2) if completed_count > 0 else 0
    
    # Today's job orders
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_orders = await db.job_orders.count_documents({
        "created_at": {"$gte": today_start}
    })
    
    return {
        "status_counts": status_counts,
        "priority_counts": priority_counts,
        "sla_breached_count": sla_breached_count,
        "total_job_orders": len(job_orders),
        "today_job_orders": today_orders,
        "avg_time_rendered_minutes": avg_time_rendered,
        "completed_count": completed_count
    }

@api_router.get("/joborders/technician/{username}")
async def get_technician_job_orders(username: str, current_user: dict = Depends(get_current_user)):
    """Get job orders assigned to a specific technician"""
    job_orders = await db.job_orders.find(
        {"assigned_technicians": username},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    sla_settings = await db.settings.find_one({"type": "sla"}, {"_id": 0}) or {}
    now = datetime.now(timezone.utc)
    
    for jo in job_orders:
        if jo.get("status") not in ["Completed", "Cancelled"]:
            created_at = jo.get("created_at")
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if created_at:
                # Ensure created_at is timezone-aware
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                sla_hours = jo.get("sla_target_hours") or get_sla_hours(jo.get("priority", "Medium"), sla_settings)
                elapsed_hours = (now - created_at).total_seconds() / 3600
                jo["sla_breached"] = elapsed_hours > sla_hours
                jo["elapsed_hours"] = round(elapsed_hours, 2)
    
    return job_orders

@api_router.get("/joborders/{job_order_id}")
async def get_job_order(job_order_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific job order"""
    job_order = await db.job_orders.find_one({"job_order_id": job_order_id}, {"_id": 0})
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    return job_order

@api_router.post("/joborders")
async def create_job_order(job_data: JobOrderCreate, current_user: dict = Depends(get_current_user)):
    """Create a new job order"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Only admin or billing can create job orders")
    
    # Get subscriber info
    subscriber = await db.subscribers.find_one({"account_number": job_data.subscriber_id}, {"_id": 0})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    # Get SLA settings
    sla_settings = await db.settings.find_one({"type": "sla"}, {"_id": 0}) or {}
    sla_hours = get_sla_hours(job_data.priority, sla_settings)
    
    job_order = {
        "job_order_id": generate_job_order_id(),
        "subscriber_id": job_data.subscriber_id,
        "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip(),
        "subscriber_address": f"{subscriber.get('street', '')}, {subscriber.get('barangay', '')}, {subscriber.get('municipality', '')}, {subscriber.get('province', '')}".strip(", "),
        "type": job_data.type,
        "description": job_data.description,
        "status": "Open",
        "priority": job_data.priority,
        "assigned_technicians": job_data.assigned_technicians,
        "scheduled_date": job_data.scheduled_date,
        "scheduled_time_slot": job_data.scheduled_time_slot,
        "notes": job_data.notes,
        "materials_used": [],
        "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc),
        "started_at": None,
        "completed_at": None,
        "time_rendered_minutes": None,
        "sla_target_hours": sla_hours,
        "sla_breached": False
    }
    
    # Add new address for relocation jobs
    if job_data.type == "Relocation" and job_data.new_address:
        job_order["new_address"] = job_data.new_address.model_dump()
    
    await db.job_orders.insert_one(job_order)
    del job_order["_id"]
    
    return {"message": "Job order created", "job_order_id": job_order["job_order_id"], "job_order": job_order}

@api_router.put("/joborders/{job_order_id}")
async def update_job_order(job_order_id: str, updates: JobOrderUpdate, current_user: dict = Depends(get_current_user)):
    """Update a job order (admin can update all fields)"""
    if current_user['role'] not in ['admin', 'billing', 'tech']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    job_order = await db.job_orders.find_one({"job_order_id": job_order_id})
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    
    # If priority changes, update SLA target
    if "priority" in update_data:
        sla_settings = await db.settings.find_one({"type": "sla"}, {"_id": 0}) or {}
        update_data["sla_target_hours"] = get_sla_hours(update_data["priority"], sla_settings)
    
    # Track status changes
    if "status" in update_data:
        if update_data["status"] == "In Progress" and not job_order.get("started_at"):
            update_data["started_at"] = datetime.now(timezone.utc)
        elif update_data["status"] == "Completed":
            update_data["completed_at"] = datetime.now(timezone.utc)
            # Calculate time rendered
            started_at = job_order.get("started_at")
            if started_at:
                if isinstance(started_at, str):
                    started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                # Ensure started_at is timezone-aware
                if started_at.tzinfo is None:
                    started_at = started_at.replace(tzinfo=timezone.utc)
                time_diff = datetime.now(timezone.utc) - started_at
                update_data["time_rendered_minutes"] = int(time_diff.total_seconds() / 60)
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.job_orders.update_one({"job_order_id": job_order_id}, {"$set": update_data})
    
    return {"message": "Job order updated"}

@api_router.post("/joborders/{job_order_id}/start")
async def start_job_order(job_order_id: str, current_user: dict = Depends(get_current_user)):
    """Start working on a job order (technician)"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Only admin or technician can start job orders")
    
    job_order = await db.job_orders.find_one({"job_order_id": job_order_id})
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    if job_order.get("status") != "Open":
        raise HTTPException(status_code=400, detail="Job order is not in Open status")
    
    await db.job_orders.update_one(
        {"job_order_id": job_order_id},
        {"$set": {
            "status": "In Progress",
            "started_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Job order started"}

@api_router.post("/joborders/{job_order_id}/complete")
async def complete_job_order(
    job_order_id: str, 
    completion_data: Optional[JobOrderComplete] = None,
    current_user: dict = Depends(get_current_user)
):
    """Complete a job order (technician)"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Only admin or technician can complete job orders")
    
    job_order = await db.job_orders.find_one({"job_order_id": job_order_id})
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    if job_order.get("status") not in ["Open", "In Progress"]:
        raise HTTPException(status_code=400, detail="Job order cannot be completed from current status")
    
    completed_at = datetime.now(timezone.utc)
    started_at = job_order.get("started_at") or job_order.get("created_at")
    
    if isinstance(started_at, str):
        started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    
    # Ensure started_at is timezone-aware
    if started_at and started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    
    time_rendered_minutes = int((completed_at - started_at).total_seconds() / 60) if started_at else 0
    
    update_data = {
        "status": "Completed",
        "completed_at": completed_at,
        "time_rendered_minutes": time_rendered_minutes,
        "completed_by": current_user['username']
    }
    
    # Add completion remarks if provided
    if completion_data and completion_data.completion_remarks:
        update_data["completion_remarks"] = completion_data.completion_remarks
    
    subscriber_id = job_order.get("subscriber_id")
    job_type = job_order.get("type")
    
    # Handle Relocation - Update subscriber address
    if job_type == "Relocation" and job_order.get("new_address"):
        new_addr = job_order.get("new_address")
        await db.subscribers.update_one(
            {"account_number": subscriber_id},
            {"$set": {
                "province": new_addr.get("province", ""),
                "municipality": new_addr.get("municipality", ""),
                "barangay": new_addr.get("barangay", ""),
                "street": new_addr.get("street", ""),
                "address_updated_at": completed_at,
                "address_updated_via": job_order_id
            }}
        )
        update_data["address_updated"] = True
    
    # Handle Pull Out Modem - Return equipment to inventory
    if job_type == "Pull Out Modem" and completion_data and completion_data.equipment_unit_id:
        unit_id = completion_data.equipment_unit_id
        # Update inventory unit to available
        await db.inventory_units.update_one(
            {"unit_id": unit_id},
            {"$set": {
                "status": "available",
                "assigned_to": None,
                "assigned_date": None,
                "assigned_via": None,
                "assigned_job_order": None,
                "returned_at": completed_at,
                "returned_via": job_order_id
            }}
        )
        # Remove from subscriber_equipment
        await db.subscriber_equipment.delete_one({
            "account_number": subscriber_id,
            "unit_id": unit_id
        })
        update_data["equipment_returned"] = unit_id
    
    # Handle Replace Modem - Mark old as defective, assign new
    if job_type == "Replace Modem" and completion_data:
        # Mark old modem as defective
        if completion_data.equipment_unit_id and completion_data.mark_defective:
            old_unit_id = completion_data.equipment_unit_id
            await db.inventory_units.update_one(
                {"unit_id": old_unit_id},
                {"$set": {
                    "status": "defective",
                    "assigned_to": None,
                    "assigned_date": None,
                    "defective_date": completed_at,
                    "defective_via": job_order_id
                }}
            )
            # Remove from subscriber_equipment
            await db.subscriber_equipment.delete_one({
                "account_number": subscriber_id,
                "unit_id": old_unit_id
            })
            update_data["old_equipment_defective"] = old_unit_id
        
        # Assign new modem
        if completion_data.new_equipment_unit_id:
            new_unit_id = completion_data.new_equipment_unit_id
            new_unit = await db.inventory_units.find_one({"unit_id": new_unit_id})
            if new_unit:
                # Update inventory unit
                await db.inventory_units.update_one(
                    {"unit_id": new_unit_id},
                    {"$set": {
                        "status": "assigned",
                        "assigned_to": subscriber_id,
                        "assigned_date": completed_at,
                        "assigned_via": "job_order",
                        "assigned_job_order": job_order_id
                    }}
                )
                # Add to subscriber_equipment
                await db.subscriber_equipment.insert_one({
                    "account_number": subscriber_id,
                    "unit_id": new_unit_id,
                    "item_code": new_unit.get("item_code"),
                    "item_name": new_unit.get("item_name"),
                    "mac_address": new_unit.get("mac_address"),
                    "serial_number": new_unit.get("serial_number"),
                    "assigned_date": completed_at,
                    "assigned_via": "job_order",
                    "job_order_id": job_order_id
                })
                update_data["new_equipment_assigned"] = new_unit_id
    
    await db.job_orders.update_one(
        {"job_order_id": job_order_id},
        {"$set": update_data}
    )
    
    return {"message": "Job order completed", "time_rendered_minutes": time_rendered_minutes}

@api_router.post("/joborders/{job_order_id}/materials")
async def add_materials_to_job_order(
    job_order_id: str,
    materials: List[MaterialEntry],
    current_user: dict = Depends(get_current_user)
):
    """Add materials used to a job order and update inventory"""
    if current_user['role'] not in ['admin', 'tech']:
        raise HTTPException(status_code=403, detail="Only admin or technician can add materials")
    
    job_order = await db.job_orders.find_one({"job_order_id": job_order_id})
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    materials_added = []
    
    for material in materials:
        # Get inventory item
        item = await db.inventory.find_one({"item_code": material.item_code}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {material.item_code} not found")
        
        # Check if serialized item
        if item.get("is_serialized") and material.unit_id:
            # Update specific unit
            unit = await db.inventory_units.find_one({"unit_id": material.unit_id})
            if not unit:
                raise HTTPException(status_code=404, detail=f"Unit {material.unit_id} not found")
            if unit.get("status") != "available":
                raise HTTPException(status_code=400, detail=f"Unit {material.unit_id} is not available")
            
            # Mark unit as assigned to job order
            await db.inventory_units.update_one(
                {"unit_id": material.unit_id},
                {"$set": {
                    "status": "assigned",
                    "assigned_to": job_order.get("subscriber_id"),
                    "assigned_date": datetime.now(timezone.utc),
                    "assigned_job_order": job_order_id
                }}
            )
            
            material_entry = {
                "item_code": material.item_code,
                "name": item.get("name"),
                "quantity": 1,
                "unit": item.get("unit"),
                "unit_id": material.unit_id,
                "mac_address": unit.get("mac_address"),
                "serial_number": unit.get("serial_number"),
                "added_at": datetime.now(timezone.utc).isoformat(),
                "added_by": current_user['username']
            }
        else:
            # Non-serialized item - deduct quantity
            if item.get("quantity", 0) < material.quantity:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {item.get('name')}")
            
            await db.inventory.update_one(
                {"item_code": material.item_code},
                {"$inc": {"quantity": -material.quantity}}
            )
            
            # Log inventory adjustment
            await db.inventory_logs.insert_one({
                "item_code": material.item_code,
                "type": "deduct",
                "amount": material.quantity,
                "unit": item.get("unit"),
                "new_qty": item.get("quantity", 0) - material.quantity,
                "reason": f"Job Order: {job_order_id}",
                "adjusted_by": current_user['username'],
                "adjusted_at": datetime.now(timezone.utc)
            })
            
            material_entry = {
                "item_code": material.item_code,
                "name": item.get("name"),
                "quantity": material.quantity,
                "unit": item.get("unit"),
                "added_at": datetime.now(timezone.utc).isoformat(),
                "added_by": current_user['username']
            }
        
        materials_added.append(material_entry)
    
    # Add to job order
    await db.job_orders.update_one(
        {"job_order_id": job_order_id},
        {"$push": {"materials_used": {"$each": materials_added}}}
    )
    
    # Also add to subscriber's equipment record if serialized
    subscriber_id = job_order.get("subscriber_id")
    for mat in materials_added:
        if mat.get("unit_id"):
            await db.subscriber_equipment.insert_one({
                "account_number": subscriber_id,
                "unit_id": mat.get("unit_id"),
                "item_code": mat.get("item_code"),
                "item_name": mat.get("name"),
                "mac_address": mat.get("mac_address"),
                "serial_number": mat.get("serial_number"),
                "assigned_date": datetime.now(timezone.utc),
                "assigned_via": "job_order",
                "job_order_id": job_order_id
            })
    
    return {"message": f"Added {len(materials_added)} materials to job order", "materials": materials_added}

@api_router.delete("/joborders/{job_order_id}")
async def delete_job_order(job_order_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a job order (admin only)"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete job orders")
    
    result = await db.job_orders.delete_one({"job_order_id": job_order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    return {"message": "Job order deleted"}

# ========== SLA SETTINGS ==========
@api_router.get("/settings/sla")
async def get_sla_settings(current_user: dict = Depends(get_current_user)):
    """Get SLA settings"""
    settings = await db.settings.find_one({"type": "sla"}, {"_id": 0})
    if not settings:
        # Return defaults
        return {
            "type": "sla",
            "critical_hours": 2,
            "high_hours": 8,
            "medium_hours": 12,
            "low_hours": 24
        }
    return settings

@api_router.put("/settings/sla")
async def update_sla_settings(sla: SLASettings, current_user: dict = Depends(get_current_user)):
    """Update SLA settings"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can update SLA settings")
    
    await db.settings.update_one(
        {"type": "sla"},
        {"$set": {
            "type": "sla",
            "critical_hours": sla.critical_hours,
            "high_hours": sla.high_hours,
            "medium_hours": sla.medium_hours,
            "low_hours": sla.low_hours,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )
    
    return {"message": "SLA settings updated"}

# ========== TECHNICIANS LIST ==========
@api_router.get("/technicians")
async def list_technicians(current_user: dict = Depends(get_current_user)):
    """Get list of users with tech role"""
    technicians = await db.users.find(
        {"role": "tech"},
        {"_id": 0, "password": 0}
    ).to_list(100)
    return technicians

# ========== INVENTORY ==========
def generate_item_code():
    """Generate a unique item code"""
    return f"ITM{uuid.uuid4().hex[:8].upper()}"

@api_router.get("/inventory")
async def list_inventory(current_user: dict = Depends(get_current_user)):
    """List all inventory items with low stock alerts"""
    items = await db.inventory.find({}, {"_id": 0}).to_list(1000)
    
    # Add low stock flag and available count for serialized items
    for item in items:
        item['low_stock'] = item.get('quantity', 0) <= item.get('restock_level', 0) and item.get('restock_level', 0) > 0
        # Calculate total value
        item['total_value'] = round(item.get('quantity', 0) * item.get('cost_per_unit', 0), 2)
        
        # For serialized items, count available units
        if item.get('is_serialized'):
            available_count = await db.inventory_units.count_documents({
                "item_code": item['item_code'],
                "status": "available"
            })
            total_units = await db.inventory_units.count_documents({
                "item_code": item['item_code']
            })
            item['available_units'] = available_count
            item['total_units'] = total_units
    
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
            raise HTTPException(status_code=400, detail="MAC address already exists in inventory")
    
    if unit.serial_number:
        existing = await db.inventory_units.find_one({"serial_number": unit.serial_number})
        if existing:
            raise HTTPException(status_code=400, detail="Serial number already exists in inventory")
    
    unit_dict = unit.model_dump()
    unit_dict['unit_id'] = generate_unit_id()
    unit_dict['item_code'] = item_code
    unit_dict['created_at'] = datetime.now(timezone.utc)
    
    await db.inventory_units.insert_one(unit_dict)
    
    # Update the parent inventory count and decrement pending_units if applicable
    await db.inventory.update_one(
        {"item_code": item_code},
        {
            "$inc": {"quantity": 1, "pending_units": -1}, 
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
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
    purchase_dict['created_by'] = current_user['username']
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
            # For serialized items, quantity starts at 0 - it will be incremented when units are added
            # For non-serialized items, use the purchased quantity
            initial_quantity = 0 if item.get('is_serialized', False) else item['quantity']
            inventory_item = {
                "item_code": new_item_code,
                "name": item['name'],
                "category": item.get('category', 'Equipment'),
                "description": f"Added via purchase {purchase_dict['purchase_id']}",
                "quantity": initial_quantity,
                "unit": item.get('unit', 'pcs'),
                "cost_per_unit": item['unit_cost'],
                "restock_level": 0,
                "is_serialized": item.get('is_serialized', False),
                "is_bulk": item.get('is_bulk', False),
                "total_length": item['quantity'] if item.get('is_bulk') else None,
                "pending_units": item['quantity'] if item.get('is_serialized', False) else 0,  # Track expected units to add
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
                if existing_item.get('is_serialized'):
                    # For serialized items, don't auto-increment quantity
                    # Instead, track pending units to be added with serial numbers
                    await db.inventory.update_one(
                        {"item_code": item['item_code']},
                        {
                            "$inc": {"pending_units": item['quantity']},
                            "$set": {"updated_at": datetime.now(timezone.utc)}
                        }
                    )
                elif existing_item.get('is_bulk'):
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
                    "new_quantity": existing_item.get('quantity', 0) + (0 if existing_item.get('is_serialized') else item['quantity']),
                    "reason": f"Purchase {purchase_dict['purchase_id']}",
                    "reference_id": purchase_dict['purchase_id'],
                    "performed_by": current_user['username'],
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
        "expense_id": f"EXP{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
        "category": "Purchase",
        "description": f"Purchase from {purchase_dict.get('supplier_name', 'Supplier')} - {len(items_processed)} item(s)",
        "amount": purchase_dict['total_amount'],
        "is_recurring": False,
        "reference_type": "purchase",
        "reference_id": purchase_dict['purchase_id'],
        "expense_date": purchase_dict['purchase_date'],
        "created_at": datetime.now(timezone.utc)
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
async def list_expenses(
    current_user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    is_recurring: Optional[bool] = None
):
    """List expenses with optional filters"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {}
    
    # Category filter
    if category:
        query["category"] = category
    
    # Recurring filter
    if is_recurring is not None:
        query["is_recurring"] = is_recurring
    
    # Date range filter
    if start_date or end_date:
        date_filter = {}
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
                date_filter["$gte"] = start_dt
            except ValueError:
                pass
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                end_dt = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
                date_filter["$lte"] = end_dt
            except ValueError:
                pass
        if date_filter:
            query["expense_date"] = date_filter
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("expense_date", -1).to_list(1000)
    return expenses

@api_router.post("/expenses")
async def create_expense(expense: Expense, current_user: dict = Depends(get_current_user)):
    """Create a new expense entry"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    expense_dict = expense.model_dump()
    expense_dict['expense_id'] = f"EXP{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}"
    expense_dict['created_by'] = current_user['username']
    
    await db.expenses.insert_one(expense_dict)
    return {"message": "Expense created", "expense_id": expense_dict['expense_id']}

@api_router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update an existing expense"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    existing = await db.expenses.find_one({"expense_id": expense_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Don't allow editing purchase-linked expenses
    if existing.get('reference_type') == 'purchase':
        raise HTTPException(status_code=400, detail="Cannot edit purchase-linked expenses")
    
    update_data = {k: v for k, v in data.items() if k not in ['expense_id', 'created_at', 'created_by', 'reference_type', 'reference_id']}
    update_data['updated_at'] = datetime.now(timezone.utc)
    update_data['updated_by'] = current_user['username']
    
    await db.expenses.update_one(
        {"expense_id": expense_id},
        {"$set": update_data}
    )
    return {"message": "Expense updated"}

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an expense"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    existing = await db.expenses.find_one({"expense_id": expense_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Don't allow deleting purchase-linked expenses
    if existing.get('reference_type') == 'purchase':
        raise HTTPException(status_code=400, detail="Cannot delete purchase-linked expenses. Delete the purchase instead.")
    
    await db.expenses.delete_one({"expense_id": expense_id})
    return {"message": "Expense deleted"}

@api_router.get("/expenses/stats")
async def get_expense_stats(current_user: dict = Depends(get_current_user)):
    """Get expense statistics"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Total expenses
    all_expenses = await db.expenses.find({}, {"_id": 0}).to_list(10000)
    total_expenses = sum(e['amount'] for e in all_expenses)
    
    # This month's expenses
    this_month = await db.expenses.find({"expense_date": {"$gte": month_start}}, {"_id": 0}).to_list(10000)
    monthly_expenses = sum(e['amount'] for e in this_month)
    
    # Recurring expenses total
    recurring = await db.expenses.find({"is_recurring": True}, {"_id": 0}).to_list(10000)
    recurring_total = sum(e['amount'] for e in recurring)
    recurring_count = len(recurring)
    
    # Category breakdown
    category_totals = {}
    for e in all_expenses:
        cat = e.get('category', 'Uncategorized')
        category_totals[cat] = category_totals.get(cat, 0) + e['amount']
    
    # Get categories count
    categories = await db.expense_categories.count_documents({})
    
    return {
        "total_expenses": total_expenses,
        "monthly_expenses": monthly_expenses,
        "recurring_total": recurring_total,
        "recurring_count": recurring_count,
        "category_breakdown": category_totals,
        "categories_count": categories,
        "expense_count": len(all_expenses)
    }

@api_router.get("/expenses/analytics")
async def get_expense_analytics(current_user: dict = Depends(get_current_user)):
    """Get expense analytics for reports and charts"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    
    # Get all expenses
    all_expenses = await db.expenses.find({}, {"_id": 0}).to_list(10000)
    
    # Helper function to safely parse expense_date (may be string or datetime)
    def parse_expense_date(date_val):
        if date_val is None:
            return None
        if isinstance(date_val, datetime):
            return date_val.replace(tzinfo=timezone.utc) if date_val.tzinfo is None else date_val
        if isinstance(date_val, str):
            try:
                parsed = datetime.fromisoformat(date_val.replace('Z', '+00:00'))
                return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
            except:
                return None
        return None
    
    # 1. Monthly trend (last 12 months)
    monthly_trend = []
    for i in range(11, -1, -1):
        # Calculate month start and end
        target_date = now - timedelta(days=i*30)
        month_start = target_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if target_date.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1)
        
        # Sum expenses for this month
        month_total = sum(
            e['amount'] for e in all_expenses 
            if parse_expense_date(e.get('expense_date')) and month_start <= parse_expense_date(e.get('expense_date')) < month_end
        )
        
        monthly_trend.append({
            "month": month_start.strftime("%b %Y"),
            "month_short": month_start.strftime("%b"),
            "amount": month_total
        })
    
    # 2. Category breakdown with percentages
    category_totals = {}
    for e in all_expenses:
        cat = e.get('category', 'Uncategorized')
        category_totals[cat] = category_totals.get(cat, 0) + e['amount']
    
    total_amount = sum(category_totals.values()) or 1  # Avoid division by zero
    category_breakdown = [
        {
            "category": cat,
            "amount": amount,
            "percentage": round((amount / total_amount) * 100, 1)
        }
        for cat, amount in sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
    ]
    
    # 3. Recurring vs One-time comparison
    recurring_total = sum(e['amount'] for e in all_expenses if e.get('is_recurring'))
    onetime_total = sum(e['amount'] for e in all_expenses if not e.get('is_recurring'))
    purchase_total = sum(e['amount'] for e in all_expenses if e.get('reference_type') == 'purchase')
    manual_total = total_amount - purchase_total
    
    expense_types = [
        {"type": "Recurring", "amount": recurring_total, "count": sum(1 for e in all_expenses if e.get('is_recurring'))},
        {"type": "One-time", "amount": onetime_total, "count": sum(1 for e in all_expenses if not e.get('is_recurring'))}
    ]
    
    expense_sources = [
        {"source": "Manual Entry", "amount": manual_total, "count": sum(1 for e in all_expenses if e.get('reference_type') != 'purchase')},
        {"source": "Purchases", "amount": purchase_total, "count": sum(1 for e in all_expenses if e.get('reference_type') == 'purchase')}
    ]
    
    # 4. Top 5 expenses
    sorted_expenses = sorted(all_expenses, key=lambda x: x.get('amount', 0), reverse=True)[:5]
    top_expenses = [
        {
            "description": e.get('description', 'Unknown'),
            "category": e.get('category', 'Uncategorized'),
            "amount": e.get('amount', 0),
            "date": parse_expense_date(e.get('expense_date')).strftime("%Y-%m-%d") if parse_expense_date(e.get('expense_date')) else None
        }
        for e in sorted_expenses
    ]
    
    # 5. This month vs last month comparison
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 1:
        last_month_start = this_month_start.replace(year=now.year - 1, month=12)
    else:
        last_month_start = this_month_start.replace(month=now.month - 1)
    
    this_month_total = sum(
        e['amount'] for e in all_expenses 
        if parse_expense_date(e.get('expense_date')) and parse_expense_date(e.get('expense_date')) >= this_month_start
    )
    last_month_total = sum(
        e['amount'] for e in all_expenses 
        if parse_expense_date(e.get('expense_date')) and last_month_start <= parse_expense_date(e.get('expense_date')) < this_month_start
    )
    
    month_comparison = {
        "this_month": this_month_total,
        "last_month": last_month_total,
        "change": this_month_total - last_month_total,
        "change_percentage": round(((this_month_total - last_month_total) / last_month_total * 100), 1) if last_month_total > 0 else 0
    }
    
    # 6. Average daily expense
    if all_expenses:
        dates = [parse_expense_date(e.get('expense_date')) for e in all_expenses if parse_expense_date(e.get('expense_date'))]
        if dates:
            min_date = min(dates)
            max_date = max(dates)
            days_span = (max_date - min_date).days or 1
            avg_daily = total_amount / days_span
        else:
            avg_daily = 0
    else:
        avg_daily = 0
    
    return {
        "monthly_trend": monthly_trend,
        "category_breakdown": category_breakdown,
        "expense_types": expense_types,
        "expense_sources": expense_sources,
        "top_expenses": top_expenses,
        "month_comparison": month_comparison,
        "avg_daily_expense": round(avg_daily, 2),
        "total_expenses": total_amount,
        "expense_count": len(all_expenses)
    }

# ========== EXPENSE CATEGORIES ==========
@api_router.get("/expense-categories")
async def list_expense_categories(current_user: dict = Depends(get_current_user)):
    """List all expense categories"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    categories = await db.expense_categories.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    
    # Initialize with preset categories if empty
    if not categories:
        preset_categories = [
            {"category_id": "CAT001", "name": "Utilities", "description": "Electricity, water, etc.", "is_preset": True},
            {"category_id": "CAT002", "name": "Salaries", "description": "Employee wages and salaries", "is_preset": True},
            {"category_id": "CAT003", "name": "Supplies", "description": "Office and operational supplies", "is_preset": True},
            {"category_id": "CAT004", "name": "Maintenance", "description": "Equipment and facility maintenance", "is_preset": True},
            {"category_id": "CAT005", "name": "Fuel", "description": "Vehicle and generator fuel", "is_preset": True},
            {"category_id": "CAT006", "name": "Internet", "description": "Internet service costs", "is_preset": True},
            {"category_id": "CAT007", "name": "Rent", "description": "Office/facility rent", "is_preset": True},
            {"category_id": "CAT008", "name": "Purchase", "description": "Inventory purchases", "is_preset": True},
        ]
        for cat in preset_categories:
            cat['created_at'] = datetime.now(timezone.utc)
        await db.expense_categories.insert_many(preset_categories)
        # Re-fetch after insert to avoid ObjectId in response
        categories = await db.expense_categories.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    
    return categories

@api_router.post("/expense-categories")
async def create_expense_category(category: ExpenseCategory, current_user: dict = Depends(get_current_user)):
    """Create a custom expense category"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check for duplicate name
    existing = await db.expense_categories.find_one({"name": {"$regex": f"^{category.name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    category_dict = category.model_dump()
    category_dict['category_id'] = f"CAT{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:4].upper()}"
    category_dict['is_preset'] = False
    category_dict['created_at'] = datetime.now(timezone.utc)
    
    await db.expense_categories.insert_one(category_dict)
    return {"message": "Category created", "category_id": category_dict['category_id']}

@api_router.delete("/expense-categories/{category_id}")
async def delete_expense_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a custom expense category (preset categories cannot be deleted)"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    category = await db.expense_categories.find_one({"category_id": category_id})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if category.get('is_preset'):
        raise HTTPException(status_code=400, detail="Cannot delete preset categories")
    
    # Check if category is in use
    expenses_using = await db.expenses.count_documents({"category": category['name']})
    if expenses_using > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete category. {expenses_using} expense(s) are using this category.")
    
    await db.expense_categories.delete_one({"category_id": category_id})
    return {"message": "Category deleted"}

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

# ========== RECEIPT SETTINGS ==========
@api_router.get("/settings/receipt")
async def get_receipt_settings(current_user: dict = Depends(get_current_user)):
    """Get receipt settings for printing"""
    settings = await db.receipt_settings.find_one({}, {"_id": 0})
    return settings or {}

@api_router.post("/settings/receipt")
async def save_receipt_settings(settings: ReceiptSettings, current_user: dict = Depends(get_current_user)):
    """Save receipt settings"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.receipt_settings.delete_many({})
    await db.receipt_settings.insert_one(settings.model_dump())
    return {"message": "Receipt settings saved"}

@api_router.get("/receipt/preview")
async def get_receipt_preview(current_user: dict = Depends(get_current_user)):
    """Get receipt preview data with sample payment"""
    settings = await db.receipt_settings.find_one({}, {"_id": 0}) or {}
    
    # Get OR prefix from settings or use default
    or_prefix = settings.get('or_prefix', 'OR')
    
    # Sample data for preview
    sample_payment = {
        "or_number": f"{or_prefix}20260216SAMPLE",
        "subscriber_name": "Juan Dela Cruz",
        "account_number": "ACC123456789",
        "address": "123 Sample Street, Manila",
        "total_amount": 1000.00,
        "mode": "Cash",
        "payment_date": get_ph_now().isoformat(),
        "received_by": current_user['username'],
        "description": "Monthly Internet Service Payment",
        "invoices_settled": [
            {"invoice_number": "INV20260216A1B2C3", "amount": 1000.00, "description": "Monthly Plan - February 2026"}
        ]
    }
    
    return {
        "settings": settings,
        "sample_payment": sample_payment
    }

@api_router.get("/receipt/data/{or_number}")
async def get_receipt_data(or_number: str, current_user: dict = Depends(get_current_user)):
    """Get receipt data for printing"""
    if current_user['role'] not in ['admin', 'cashier', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    payment = await db.payments.find_one({"or_number": or_number}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    subscriber = await db.subscribers.find_one({"account_number": payment['subscriber_id']}, {"_id": 0})
    settings = await db.receipt_settings.find_one({}, {"_id": 0}) or {}
    
    # Build address
    address = ""
    if subscriber:
        address_parts = [
            subscriber.get('street'),
            subscriber.get('barangay'),
            subscriber.get('municipality'),
            subscriber.get('province')
        ]
        address = ', '.join(filter(None, address_parts)) or subscriber.get('address', '')
    
    return {
        "settings": settings,
        "payment": {
            "or_number": payment.get('or_number'),
            "subscriber_name": payment.get('subscriber_name', f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip() if subscriber else 'Unknown'),
            "account_number": payment.get('subscriber_id'),
            "address": address,
            "total_amount": payment.get('total_amount', payment.get('amount', 0)),
            "mode": payment.get('mode', 'Cash'),
            "payment_date": payment.get('payment_date').isoformat() if payment.get('payment_date') else None,
            "received_by": payment.get('received_by', 'Cashier'),
            "invoices_settled": payment.get('invoices_settled', []),
            "invoices_partial": payment.get('invoices_partial', []),
            "description": payment.get('description', ''),
            "is_advance_payment": payment.get('is_advance_payment', False),
            "wallet_credit": payment.get('wallet_credit', 0)
        }
    }

# ========== DISCOUNTS/REBATES ==========
@api_router.get("/discounts")
async def get_discounts(current_user: dict = Depends(get_current_user)):
    """Get all discounts/rebates"""
    discounts = await db.discounts.find({}, {"_id": 0}).to_list(1000)
    return discounts

@api_router.get("/discounts/{discount_id}")
async def get_discount(discount_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single discount by ID"""
    discount = await db.discounts.find_one({"discount_id": discount_id}, {"_id": 0})
    if not discount:
        raise HTTPException(status_code=404, detail="Discount not found")
    return discount

@api_router.post("/discounts")
async def create_discount(discount: DiscountCreate, current_user: dict = Depends(get_current_user)):
    """Create a new discount/rebate"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    discount_id = f"DISC{uuid.uuid4().hex[:8].upper()}"
    discount_doc = {
        "discount_id": discount_id,
        "name": discount.name,
        "discount_type": discount.discount_type,
        "value": discount.value,
        "duration": discount.duration,
        "apply_to": discount.apply_to,
        "subscriber_ids": discount.subscriber_ids,
        "plan_ids": discount.plan_ids,
        "is_active": discount.is_active,
        "created_at": get_ph_now().isoformat(),
        "created_by": current_user['username'],
        "times_used": 0,
        "total_amount_discounted": 0
    }
    
    await db.discounts.insert_one(discount_doc)
    discount_doc.pop('_id', None)
    return discount_doc

@api_router.put("/discounts/{discount_id}")
async def update_discount(discount_id: str, discount: DiscountUpdate, current_user: dict = Depends(get_current_user)):
    """Update a discount/rebate"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.discounts.find_one({"discount_id": discount_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Discount not found")
    
    update_data = {k: v for k, v in discount.model_dump().items() if v is not None}
    update_data["updated_at"] = get_ph_now().isoformat()
    
    await db.discounts.update_one({"discount_id": discount_id}, {"$set": update_data})
    
    updated = await db.discounts.find_one({"discount_id": discount_id}, {"_id": 0})
    return updated

@api_router.delete("/discounts/{discount_id}")
async def delete_discount(discount_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a discount/rebate"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.discounts.delete_one({"discount_id": discount_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Discount not found")
    
    return {"message": "Discount deleted successfully"}

@api_router.get("/subscribers/{account_number}/discounts")
async def get_subscriber_discounts(account_number: str, current_user: dict = Depends(get_current_user)):
    """Get all applicable discounts for a subscriber"""
    subscriber = await db.subscribers.find_one({"account_number": account_number}, {"_id": 0})
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    
    # Get all active discounts
    all_discounts = await db.discounts.find({"is_active": True}, {"_id": 0}).to_list(1000)
    
    # Get one-time discounts already used by this subscriber
    used_one_time = await db.discount_usage.find({"subscriber_id": account_number}).to_list(1000)
    used_discount_ids = set(u['discount_id'] for u in used_one_time)
    
    applicable_discounts = []
    for discount in all_discounts:
        # Skip one-time discounts already used
        if discount['duration'] == 'one-time' and discount['discount_id'] in used_discount_ids:
            continue
            
        is_applicable = False
        
        # Check apply_to rules
        if discount['apply_to'] == 'all_active' and subscriber.get('status') == 'active':
            is_applicable = True
        elif discount['apply_to'] == 'selected_subscribers':
            if account_number in discount.get('subscriber_ids', []):
                is_applicable = True
        elif discount['apply_to'] == 'by_plan':
            subscriber_plan = subscriber.get('plan_name') or subscriber.get('plan', {}).get('name', '')
            if subscriber_plan in discount.get('plan_ids', []):
                is_applicable = True
        
        if is_applicable:
            applicable_discounts.append(discount)
    
    return applicable_discounts

@api_router.post("/discounts/{discount_id}/apply")
async def record_discount_usage(discount_id: str, amount_discounted: float, current_user: dict = Depends(get_current_user)):
    """Record that a discount was used (called after payment with discount)"""
    discount = await db.discounts.find_one({"discount_id": discount_id})
    if not discount:
        raise HTTPException(status_code=404, detail="Discount not found")
    
    # Update usage stats
    await db.discounts.update_one(
        {"discount_id": discount_id},
        {
            "$inc": {
                "times_used": 1,
                "total_amount_discounted": amount_discounted
            }
        }
    )
    
    # If one-time discount, mark as used for the subscriber (we'll track this separately)
    return {"message": "Discount usage recorded"}

@api_router.get("/discounts/stats/total")
async def get_total_discounts_stats(current_user: dict = Depends(get_current_user)):
    """Get total discount statistics for dashboard"""
    discounts = await db.discounts.find({}, {"_id": 0}).to_list(1000)
    
    total_discounts_given = sum(d.get('total_amount_discounted', 0) for d in discounts)
    total_times_used = sum(d.get('times_used', 0) for d in discounts)
    active_discounts = len([d for d in discounts if d.get('is_active', False)])
    
    return {
        "total_discounts_given": total_discounts_given,
        "total_times_used": total_times_used,
        "active_discounts": active_discounts
    }

# ========== DASHBOARD STATS ==========
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
    period: str = Query("all", description="Filter period: daily, weekly, monthly, yearly, all")
):
    """Get dashboard statistics with optional time period filter"""
    
    # Calculate date range based on period
    now = datetime.now(timezone.utc)
    date_filter = None
    
    if period == "daily":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"$gte": start_date}
    elif period == "weekly":
        # Start from Monday of current week
        start_date = now - timedelta(days=now.weekday())
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"$gte": start_date}
    elif period == "monthly":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"$gte": start_date}
    elif period == "yearly":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"$gte": start_date}
    # "all" means no date filter
    
    # Calculate stats
    total_subscribers = await db.subscribers.count_documents({"is_active": True})
    
    # Build query for payments - use payment_date (not created_at)
    payment_query = {}
    if date_filter:
        payment_query["payment_date"] = date_filter
    
    # Gross sales - handle both 'amount' (legacy) and 'total_amount' (centralized payments)
    payments = await db.payments.find(payment_query).to_list(10000)
    gross_sales = sum(p.get('total_amount', p.get('amount', 0)) for p in payments)
    
    # Expenses with date filter
    expense_query = {}
    if date_filter:
        expense_query["expense_date"] = date_filter
    expenses = await db.expenses.find(expense_query).to_list(10000)
    total_expenses = sum(e['amount'] for e in expenses)
    
    # Net sales
    net_sales = gross_sales - total_expenses
    
    # Invoices with date filter
    invoice_query = {}
    if date_filter:
        invoice_query["created_at"] = date_filter
    total_invoices = await db.invoices.count_documents(invoice_query)
    
    # Unpaid invoices (within period)
    unpaid_query = {"paid": False}
    if date_filter:
        unpaid_query["created_at"] = date_filter
    unpaid_invoices = await db.invoices.count_documents(unpaid_query)
    
    # Receivables - calculate correctly using remaining balance (amount - paid_amount)
    unpaid = await db.invoices.find({"paid": False}).to_list(10000)
    receivables = sum(inv.get('amount', 0) - inv.get('paid_amount', 0) for inv in unpaid)
    
    # Open tickets (current state, not period-filtered)
    open_tickets = await db.job_orders.count_documents({"status": "Open"})
    
    # Total discounts given (within period if filtered)
    discount_query = {}
    if date_filter:
        discount_query["created_at"] = date_filter
    discounts = await db.discounts.find(discount_query, {"_id": 0}).to_list(1000)
    total_discounts = sum(d.get('total_amount_discounted', 0) for d in discounts)
    
    # Calculate comparison with previous period
    prev_gross_sales = 0
    prev_expenses = 0
    prev_net_sales = 0
    
    if period != "all":
        # Calculate previous period range
        if period == "daily":
            prev_start = start_date - timedelta(days=1)
            prev_end = start_date
        elif period == "weekly":
            prev_start = start_date - timedelta(weeks=1)
            prev_end = start_date
        elif period == "monthly":
            if start_date.month == 1:
                prev_start = start_date.replace(year=start_date.year - 1, month=12)
            else:
                prev_start = start_date.replace(month=start_date.month - 1)
            prev_end = start_date
        elif period == "yearly":
            prev_start = start_date.replace(year=start_date.year - 1)
            prev_end = start_date
        
        prev_date_filter = {"$gte": prev_start, "$lt": prev_end}
        
        # Previous period payments - use payment_date
        prev_payments = await db.payments.find({"payment_date": prev_date_filter}).to_list(10000)
        prev_gross_sales = sum(p.get('total_amount', p.get('amount', 0)) for p in prev_payments)
        
        # Previous period expenses
        prev_expenses_list = await db.expenses.find({"expense_date": prev_date_filter}).to_list(10000)
        prev_expenses = sum(e['amount'] for e in prev_expenses_list)
        
        prev_net_sales = prev_gross_sales - prev_expenses
    
    # Calculate percentage changes
    def calc_change(current, previous):
        if previous == 0:
            return 100 if current > 0 else 0
        return round(((current - previous) / previous) * 100, 1)
    
    return {
        "active_subscribers": total_subscribers,
        "gross_sales": gross_sales,
        "expenses": total_expenses,
        "net_sales": net_sales,
        "receivables": receivables,
        "open_tickets": open_tickets,
        "total_invoices": total_invoices,
        "unpaid_invoices": unpaid_invoices,
        "total_discounts": total_discounts,
        "period": period,
        "changes": {
            "gross_sales": calc_change(gross_sales, prev_gross_sales),
            "expenses": calc_change(total_expenses, prev_expenses),
            "net_sales": calc_change(net_sales, prev_net_sales)
        }
    }


@api_router.get("/dashboard/billing-overview")
async def get_billing_overview(
    current_user: dict = Depends(get_current_user),
    period: str = Query("all", description="Filter period: daily, weekly, monthly, yearly, all")
):
    """Get billing overview statistics for dashboard"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    date_filter = None
    
    if period == "daily":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"$gte": start_date}
    elif period == "weekly":
        start_date = now - timedelta(days=now.weekday())
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"$gte": start_date}
    elif period == "monthly":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"$gte": start_date}
    elif period == "yearly":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        date_filter = {"$gte": start_date}
    
    # Total subscribers
    total_subscribers = await db.subscribers.count_documents({"is_active": True})
    
    # Invoices generated in period
    invoice_query = {}
    if date_filter:
        invoice_query["created_at"] = date_filter
    invoices_generated = await db.invoices.count_documents(invoice_query)
    
    # Invoices paid in period
    paid_query = {"paid": True}
    if date_filter:
        paid_query["paid_at"] = date_filter
    invoices_paid = await db.invoices.count_documents(paid_query)
    
    # Pending invoices - FILTERED by created_at (invoices created in period that are unpaid)
    pending_query = {"paid": False}
    if date_filter:
        pending_query["created_at"] = date_filter
    pending_invoices = await db.invoices.count_documents(pending_query)
    
    # Total amount collected in period - use payment_date
    payment_query = {}
    if date_filter:
        payment_query["payment_date"] = date_filter
    payments = await db.payments.find(payment_query).to_list(10000)
    total_collected = sum(p.get('total_amount', p.get('amount', 0)) for p in payments)
    
    # Total receivables - FILTERED by created_at (receivables from invoices created in period)
    receivables_query = {"paid": False, "due_date": {"$exists": True, "$ne": None, "$ne": ""}}
    if date_filter:
        receivables_query["created_at"] = date_filter
    unpaid = await db.invoices.find(receivables_query).to_list(10000)
    total_receivables = sum(inv.get('amount', 0) - inv.get('paid_amount', 0) for inv in unpaid)
    
    # Collection rate for period (if invoices were generated)
    collection_rate = 0
    if invoices_generated > 0:
        collection_rate = round((invoices_paid / invoices_generated) * 100, 1)
    
    # Overdue invoices - FILTERED by created_at (overdue invoices created in period)
    overdue_query = {"paid": False, "due_date": {"$lt": now}}
    if date_filter:
        overdue_query["created_at"] = date_filter
    overdue_invoices = await db.invoices.count_documents(overdue_query)
    
    # Subscribers with arrears - from invoices created in period
    subscribers_with_arrears = len(set([inv.get('subscriber_id') for inv in unpaid if inv.get('subscriber_id')]))
    
    # Recent billing activity - sort by payment_date
    recent_payments = await db.payments.find({}, {"_id": 0}).sort("payment_date", -1).limit(5).to_list(5)
    
    return {
        "total_subscribers": total_subscribers,
        "invoices_generated": invoices_generated,
        "invoices_paid": invoices_paid,
        "pending_invoices": pending_invoices,
        "overdue_invoices": overdue_invoices,
        "total_collected": total_collected,
        "total_receivables": total_receivables,
        "collection_rate": collection_rate,
        "subscribers_with_arrears": subscribers_with_arrears,
        "period": period,
        "recent_payments": recent_payments[:5]
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
        # Get admin password from environment variable
        admin_password = os.environ.get('ADMIN_PASSWORD', 'changeme')
        admin_user = {
            "username": "admin",
            "full_name": "Administrator",
            "role": "admin",
            "password": hash_password(admin_password),
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
            
            # Schedule daily billing at specified time in Philippine timezone
            scheduler.add_job(
                auto_generate_billing,
                CronTrigger(hour=hour, minute=minute, timezone=PH_TIMEZONE),
                id='daily_billing',
                replace_existing=True
            )
            
            scheduler.start()
            logger.info(f"Automatic billing scheduler started - runs daily at {billing_time} (Philippine Time)")
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

# ========== PAYMONGO INTEGRATION ==========

class PaymongoSettings(BaseModel):
    """PayMongo API settings model"""
    public_key: str = Field(..., description="PayMongo public key (pk_test_... or pk_live_...)")
    secret_key: str = Field(..., description="PayMongo secret key (sk_test_... or sk_live_...)")
    webhook_secret: Optional[str] = Field(None, description="Webhook secret key")
    is_live_mode: bool = Field(False, description="True for production, False for test mode")
    enabled: bool = Field(True, description="Enable/disable PayMongo payments")
    service_fee: float = Field(0, description="Service fee to add on online payments")

class PaymongoSettingsResponse(BaseModel):
    """Safe response model that hides sensitive data"""
    public_key: str
    is_live_mode: bool
    enabled: bool
    has_secret_key: bool
    has_webhook_secret: bool
    configured: bool
    service_fee: float = 0

@api_router.get("/settings/paymongo")
async def get_paymongo_settings(current_user: dict = Depends(get_current_user)):
    """Get PayMongo settings (masked for security)"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    settings = await db.paymongo_settings.find_one({}, {"_id": 0})
    
    if not settings:
        return {
            "public_key": "",
            "is_live_mode": False,
            "enabled": False,
            "has_secret_key": False,
            "has_webhook_secret": False,
            "configured": False,
            "service_fee": 0
        }
    
    # Mask the keys for security
    public_key = settings.get('public_key', '')
    
    return {
        "public_key": public_key[:12] + "..." + public_key[-4:] if len(public_key) > 16 else public_key,
        "is_live_mode": settings.get('is_live_mode', False),
        "enabled": settings.get('enabled', False),
        "has_secret_key": bool(settings.get('secret_key_encrypted')),
        "has_webhook_secret": bool(settings.get('webhook_secret_encrypted')),
        "configured": bool(settings.get('public_key') and settings.get('secret_key_encrypted')),
        "service_fee": settings.get('service_fee', 0)
    }

@api_router.post("/settings/paymongo")
async def save_paymongo_settings(settings: PaymongoSettings, current_user: dict = Depends(get_current_user)):
    """Save PayMongo settings with encrypted credentials"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Validate key formats
    if settings.public_key and not settings.public_key.startswith(('pk_test_', 'pk_live_')):
        raise HTTPException(status_code=400, detail="Invalid public key format. Must start with pk_test_ or pk_live_")
    
    if settings.secret_key and not settings.secret_key.startswith(('sk_test_', 'sk_live_')):
        raise HTTPException(status_code=400, detail="Invalid secret key format. Must start with sk_test_ or sk_live_")
    
    # Validate consistency (test keys with test mode, live keys with live mode)
    if settings.is_live_mode:
        if settings.public_key and not settings.public_key.startswith('pk_live_'):
            raise HTTPException(status_code=400, detail="Live mode requires pk_live_ public key")
        if settings.secret_key and not settings.secret_key.startswith('sk_live_'):
            raise HTTPException(status_code=400, detail="Live mode requires sk_live_ secret key")
    else:
        if settings.public_key and not settings.public_key.startswith('pk_test_'):
            raise HTTPException(status_code=400, detail="Test mode requires pk_test_ public key")
        if settings.secret_key and not settings.secret_key.startswith('sk_test_'):
            raise HTTPException(status_code=400, detail="Test mode requires sk_test_ secret key")
    
    # Encrypt sensitive data
    settings_doc = {
        "public_key": settings.public_key,
        "secret_key_encrypted": encrypt_password(settings.secret_key) if settings.secret_key else None,
        "webhook_secret_encrypted": encrypt_password(settings.webhook_secret) if settings.webhook_secret else None,
        "is_live_mode": settings.is_live_mode,
        "enabled": settings.enabled,
        "service_fee": settings.service_fee,
        "updated_at": get_ph_now().isoformat(),
        "updated_by": current_user['username']
    }
    
    await db.paymongo_settings.delete_many({})
    await db.paymongo_settings.insert_one(settings_doc)
    
    return {"message": "PayMongo settings saved successfully"}

@api_router.post("/settings/paymongo/test")
async def test_paymongo_connection(current_user: dict = Depends(get_current_user)):
    """Test PayMongo API connection"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    settings = await db.paymongo_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get('secret_key_encrypted'):
        raise HTTPException(status_code=400, detail="PayMongo not configured")
    
    try:
        secret_key = decrypt_password(settings['secret_key_encrypted'])
        
        # Test API connection using webhooks list endpoint
        auth_header = base64.b64encode(f"{secret_key}:".encode()).decode()
        
        async with httpx.AsyncClient(timeout=30) as client:
            # Test with webhooks endpoint - this is a reliable way to verify API key
            response = await client.get(
                "https://api.paymongo.com/v1/webhooks",
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code == 200:
                return {
                    "success": True,
                    "message": "PayMongo API connection successful",
                    "mode": "live" if settings.get('is_live_mode') else "test"
                }
            elif response.status_code == 401:
                return {
                    "success": False,
                    "message": "Invalid API key - authentication failed"
                }
            else:
                # Try alternative test - create a minimal checkout session test
                # If webhooks endpoint fails, try listing links
                response2 = await client.get(
                    "https://api.paymongo.com/v1/links",
                    headers={
                        "Authorization": f"Basic {auth_header}",
                        "Content-Type": "application/json"
                    }
                )
                
                if response2.status_code == 200:
                    return {
                        "success": True,
                        "message": "PayMongo API connection successful",
                        "mode": "live" if settings.get('is_live_mode') else "test"
                    }
                elif response2.status_code == 401:
                    return {
                        "success": False,
                        "message": "Invalid API key - authentication failed"
                    }
                else:
                    return {
                        "success": False,
                        "message": f"Could not verify API connection. Status: {response2.status_code}"
                    }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}"
        }

# ========== PAYMONGO PAYMENT ENDPOINTS ==========

class CreatePaymentRequest(BaseModel):
    """Request model for creating a payment"""
    amount: float = Field(..., gt=0, description="Amount in PHP")
    invoice_ids: List[str] = Field(..., description="List of invoice IDs to pay")
    description: Optional[str] = None

@api_router.post("/subscriber/pay/create-checkout")
async def create_subscriber_checkout(
    request: CreatePaymentRequest,
    current_subscriber: dict = Depends(get_current_subscriber)
):
    """Create a PayMongo checkout session for subscriber payment"""
    
    # Check if PayMongo is configured
    pm_settings = await db.paymongo_settings.find_one({}, {"_id": 0})
    if not pm_settings or not pm_settings.get('enabled'):
        raise HTTPException(status_code=400, detail="Online payment is not available")
    
    if not pm_settings.get('secret_key_encrypted'):
        raise HTTPException(status_code=400, detail="Payment gateway not configured")
    
    try:
        secret_key = decrypt_password(pm_settings['secret_key_encrypted'])
        auth_header = base64.b64encode(f"{secret_key}:".encode()).decode()
        
        # Verify invoices belong to this subscriber and calculate total
        total_amount = 0
        invoice_details = []
        
        for inv_id in request.invoice_ids:
            invoice = await db.invoices.find_one({
                "invoice_number": inv_id,
                "subscriber_id": current_subscriber['account_number'],
                "paid": False
            })
            
            if not invoice:
                raise HTTPException(status_code=400, detail=f"Invoice {inv_id} not found or already paid")
            
            remaining = (invoice.get('amount', 0) - invoice.get('paid_amount', 0))
            total_amount += remaining
            invoice_details.append({
                "invoice_number": inv_id,
                "amount": remaining,
                "description": invoice.get('description', 'Invoice Payment')
            })
        
        # Get service fee from settings
        service_fee = pm_settings.get('service_fee', 0)
        
        # Create a unique reference ID
        reference_id = f"PAY{uuid.uuid4().hex[:12].upper()}"
        
        # Get frontend URL for redirects
        frontend_url = os.environ.get('FRONTEND_URL', 'https://isp-admin-panel.preview.emergentagent.com')
        
        # Build line items - invoice amount + service fee (if any)
        line_items = [{
            "name": f"Invoice Payment - {current_subscriber['account_number']}",
            "amount": int(total_amount * 100),  # Convert to centavos
            "currency": "PHP",
            "quantity": 1,
            "description": request.description or f"Payment for {len(invoice_details)} invoice(s)"
        }]
        
        # Add service fee as separate line item if configured
        if service_fee > 0:
            line_items.append({
                "name": "Service Fee",
                "amount": int(service_fee * 100),  # Convert to centavos
                "currency": "PHP",
                "quantity": 1,
                "description": "Online payment processing fee"
            })
        
        # Calculate grand total
        grand_total = total_amount + service_fee
        
        # Create checkout session
        payload = {
            "data": {
                "attributes": {
                    "line_items": line_items,
                    "payment_method_types": ["gcash", "grab_pay", "card", "paymaya"],
                    "success_url": f"{frontend_url}/subscriber?payment=success&ref={reference_id}",
                    "cancel_url": f"{frontend_url}/subscriber?payment=cancelled",
                    "description": f"Bill Payment - {current_subscriber['account_number']}",
                    "reference_number": reference_id,
                    "metadata": {
                        "subscriber_id": current_subscriber['account_number'],
                        "invoice_ids": ",".join(request.invoice_ids),
                        "reference_id": reference_id,
                        "service_fee": str(service_fee)
                    }
                }
            }
        }
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.paymongo.com/v1/checkout_sessions",
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Content-Type": "application/json"
                },
                json=payload
            )
            
            if response.status_code != 200:
                error_detail = response.json().get('errors', [{}])[0].get('detail', 'Unknown error')
                raise HTTPException(status_code=400, detail=f"Payment gateway error: {error_detail}")
            
            result = response.json()
            checkout_url = result['data']['attributes']['checkout_url']
            session_id = result['data']['id']
            
            # Store pending payment record
            payment_record = {
                "reference_id": reference_id,
                "session_id": session_id,
                "subscriber_id": current_subscriber['account_number'],
                "invoice_ids": request.invoice_ids,
                "invoice_amount": total_amount,
                "service_fee": service_fee,
                "amount": grand_total,
                "status": "pending",
                "created_at": get_ph_now().isoformat(),
                "checkout_url": checkout_url
            }
            await db.pending_payments.insert_one(payment_record)
            
            return {
                "checkout_url": checkout_url,
                "session_id": session_id,
                "reference_id": reference_id,
                "invoice_amount": total_amount,
                "service_fee": service_fee,
                "amount": grand_total
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PayMongo checkout error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create payment session")

@api_router.get("/subscriber/pay/status/{reference_id}")
async def check_payment_status(
    reference_id: str,
    current_subscriber: dict = Depends(get_current_subscriber)
):
    """Check payment status by reference ID"""
    
    pending_payment = await db.pending_payments.find_one({
        "reference_id": reference_id,
        "subscriber_id": current_subscriber['account_number']
    }, {"_id": 0})
    
    if not pending_payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # If already processed, return status
    if pending_payment.get('status') in ['completed', 'failed']:
        return {
            "status": pending_payment['status'],
            "amount": pending_payment['amount'],
            "processed_at": pending_payment.get('processed_at')
        }
    
    # Check with PayMongo
    pm_settings = await db.paymongo_settings.find_one({}, {"_id": 0})
    if not pm_settings or not pm_settings.get('secret_key_encrypted'):
        return {"status": "pending", "amount": pending_payment['amount']}
    
    try:
        secret_key = decrypt_password(pm_settings['secret_key_encrypted'])
        auth_header = base64.b64encode(f"{secret_key}:".encode()).decode()
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"https://api.paymongo.com/v1/checkout_sessions/{pending_payment['session_id']}",
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                attrs = data['data']['attributes']
                pm_status = attrs.get('status')
                payments = attrs.get('payments', [])
                
                # Check if there's a successful payment in the payments array
                has_paid_payment = any(
                    p.get('attributes', {}).get('status') == 'paid' 
                    for p in payments
                )
                
                if has_paid_payment or pm_status == 'paid':
                    # Process the payment
                    await process_successful_payment(reference_id, pending_payment)
                    return {
                        "status": "completed",
                        "amount": pending_payment['amount'],
                        "message": "Payment successful!"
                    }
                elif pm_status == 'expired':
                    await db.pending_payments.update_one(
                        {"reference_id": reference_id},
                        {"$set": {"status": "expired"}}
                    )
                    return {"status": "expired", "amount": pending_payment['amount']}
                
        return {"status": "pending", "amount": pending_payment['amount']}
        
    except Exception as e:
        logger.error(f"Payment status check error: {str(e)}")
        return {"status": "pending", "amount": pending_payment['amount']}

async def process_successful_payment(reference_id: str, pending_payment: dict):
    """Process a successful payment from PayMongo"""
    
    subscriber_id = pending_payment['subscriber_id']
    invoice_ids = pending_payment['invoice_ids']
    # Use invoice_amount (without service fee) for settling invoices
    # Fall back to 'amount' for backwards compatibility with old records
    invoice_amount = pending_payment.get('invoice_amount', pending_payment['amount'])
    service_fee = pending_payment.get('service_fee', 0)
    total_paid = pending_payment['amount']  # Grand total including service fee
    
    # Create payment record using centralized payment system
    now = get_ph_now()
    
    # Generate OR number
    receipt_settings = await db.receipt_settings.find_one({}, {"_id": 0}) or {}
    or_prefix = receipt_settings.get('or_prefix', 'OR')
    or_number = f"{or_prefix}{now.strftime('%Y%m%d')}{reference_id[-6:]}"
    
    # Get subscriber details
    subscriber = await db.subscribers.find_one({"account_number": subscriber_id})
    
    invoices_settled = []
    remaining_amount = invoice_amount  # Only the invoice portion, not service fee
    
    # Settle invoices
    for inv_id in invoice_ids:
        if remaining_amount <= 0:
            break
            
        invoice = await db.invoices.find_one({"invoice_number": inv_id, "paid": False})
        if not invoice:
            continue
            
        inv_remaining = invoice.get('amount', 0) - invoice.get('paid_amount', 0)
        payment_for_invoice = min(remaining_amount, inv_remaining)
        
        new_paid_amount = invoice.get('paid_amount', 0) + payment_for_invoice
        is_fully_paid = new_paid_amount >= invoice.get('amount', 0)
        
        await db.invoices.update_one(
            {"invoice_number": inv_id},
            {"$set": {
                "paid_amount": new_paid_amount,
                "paid": is_fully_paid,
                "paid_date": now.isoformat() if is_fully_paid else None,
                "payment_method": "online"
            }}
        )
        
        invoices_settled.append({
            "invoice_number": inv_id,
            "amount": payment_for_invoice,
            "description": invoice.get('description', '')
        })
        
        remaining_amount -= payment_for_invoice
    
    # Create payment record
    payment_doc = {
        "or_number": or_number,
        "subscriber_id": subscriber_id,
        "subscriber_name": f"{subscriber.get('first_name', '')} {subscriber.get('last_name', '')}".strip(),
        "total_amount": total_paid,  # Record the full amount paid including service fee
        "invoice_amount": invoice_amount,
        "service_fee": service_fee,
        "payment_mode": "online_paymongo",
        "payment_date": now,
        "received_by": "Online Payment",
        "invoices_settled": invoices_settled,
        "reference_id": reference_id,
        "description": f"Online Payment via PayMongo" + (f" (incl. ₱{service_fee} service fee)" if service_fee > 0 else ""),
        "is_advance_payment": remaining_amount > 0,
        "wallet_credit": remaining_amount if remaining_amount > 0 else 0
    }
    
    await db.payments.insert_one(payment_doc)
    
    # If there's remaining amount, add to wallet
    if remaining_amount > 0:
        await db.subscribers.update_one(
            {"account_number": subscriber_id},
            {"$inc": {"wallet_balance": remaining_amount}}
        )
    
    # Update pending payment status
    await db.pending_payments.update_one(
        {"reference_id": reference_id},
        {"$set": {
            "status": "completed",
            "processed_at": now.isoformat(),
            "or_number": or_number
        }}
    )

@api_router.post("/webhooks/paymongo")
async def paymongo_webhook(request: dict):
    """Handle PayMongo webhook events"""
    
    try:
        event_type = request.get("data", {}).get("attributes", {}).get("type")
        event_data = request.get("data", {}).get("attributes", {}).get("data", {})
        
        logger.info(f"PayMongo webhook received: {event_type}")
        
        if event_type == "checkout_session.payment.paid":
            # Extract metadata
            metadata = event_data.get("attributes", {}).get("metadata", {})
            reference_id = metadata.get("reference_id")
            
            if reference_id:
                pending_payment = await db.pending_payments.find_one({"reference_id": reference_id})
                if pending_payment and pending_payment.get('status') == 'pending':
                    await process_successful_payment(reference_id, pending_payment)
                    logger.info(f"Payment processed via webhook: {reference_id}")
        
        return {"status": "received"}
        
    except Exception as e:
        logger.error(f"Webhook processing error: {str(e)}")
        return {"status": "error", "message": str(e)}

@api_router.get("/paymongo/public-key")
async def get_paymongo_public_key():
    """Get PayMongo public key for frontend (no auth required for subscriber checkout)"""
    
    settings = await db.paymongo_settings.find_one({}, {"_id": 0})
    
    if not settings or not settings.get('enabled'):
        return {"enabled": False, "public_key": None, "service_fee": 0}
    
    return {
        "enabled": True,
        "public_key": settings.get('public_key'),
        "is_live_mode": settings.get('is_live_mode', False),
        "service_fee": settings.get('service_fee', 0)
    }

# ========== REPORTS MODULE ==========

@api_router.get("/cashier/receivables")
async def get_cashier_receivables(
    current_user: dict = Depends(get_current_user),
    status: str = Query("active", description="Filter: active, inactive, all"),
    search: str = Query("", description="Search by account or name"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """Get receivables list grouped by subscriber for cashier view"""
    if current_user['role'] not in ['admin', 'cashier', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build subscriber filter
    sub_filter = {}
    if status == 'active':
        sub_filter['is_active'] = True
    elif status == 'inactive':
        sub_filter['is_active'] = False
    # 'all' means no is_active filter
    
    if search:
        sub_filter['$or'] = [
            {"account_number": {"$regex": search, "$options": "i"}},
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}}
        ]
    
    # Get subscribers matching filter
    total_count = await db.subscribers.count_documents(sub_filter)
    skip = (page - 1) * limit
    subscribers = await db.subscribers.find(sub_filter, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    # For each subscriber, get their unpaid invoices
    receivables = []
    for sub in subscribers:
        account_number = sub.get('account_number')
        
        # Count unpaid invoices
        unpaid_invoices = await db.invoices.find({
            "subscriber_id": account_number,
            "paid": False
        }).to_list(100)
        
        if unpaid_invoices:
            # Calculate total due with safe number conversion
            def safe_float(val, default=0):
                if val is None or val == '':
                    return default
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return default
            
            total_due = sum(safe_float(inv.get('amount')) - safe_float(inv.get('paid_amount')) for inv in unpaid_invoices)
            
            receivables.append({
                "subscriber_id": account_number,
                "subscriber_name": f"{sub.get('first_name', '')} {sub.get('last_name', '')}".strip(),
                "phone": sub.get('phone') or sub.get('mobile', ''),
                "is_active": sub.get('is_active', False),
                "total_due": total_due,
                "invoice_count": len(unpaid_invoices),
                "oldest_due_date": min([inv.get('due_date') for inv in unpaid_invoices if inv.get('due_date')], default=None)
            })
    
    # Sort by total_due descending
    receivables.sort(key=lambda x: x['total_due'], reverse=True)
    
    return {
        "receivables": receivables,
        "total_count": total_count,
        "page": page,
        "pages": (total_count + limit - 1) // limit
    }



@api_router.get("/reports/receivables")
async def get_receivables_report(current_user: dict = Depends(get_current_user)):
    """
    Get receivables report with aging buckets.
    Returns: current, 1-30 days, 31-60 days, 61-90 days, over 90 days
    """
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    today = get_ph_now()
    
    # Get all unpaid invoices
    unpaid_invoices = await db.invoices.find({"paid": False}, {"_id": 0}).to_list(10000)
    
    # Get all subscribers for name lookup (cache for efficiency)
    subscribers_cursor = db.subscribers.find({}, {"_id": 0, "account_number": 1, "first_name": 1, "last_name": 1})
    subscribers_list = await subscribers_cursor.to_list(10000)
    subscriber_names = {s['account_number']: f"{s.get('first_name', '')} {s.get('last_name', '')}".strip() for s in subscribers_list}
    
    # Initialize aging buckets
    aging = {
        "current": {"count": 0, "amount": 0, "invoices": []},
        "1_30_days": {"count": 0, "amount": 0, "invoices": []},
        "31_60_days": {"count": 0, "amount": 0, "invoices": []},
        "61_90_days": {"count": 0, "amount": 0, "invoices": []},
        "over_90_days": {"count": 0, "amount": 0, "invoices": []}
    }
    
    total_receivable = 0
    
    for inv in unpaid_invoices:
        due_date = inv.get('due_date')
        if not due_date:
            continue
            
        # Parse due_date if it's a string
        if isinstance(due_date, str):
            try:
                due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            except:
                continue
        
        # Make timezone-aware if naive
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
        
        # Safe number conversion for amount calculations
        def safe_float(val, default=0):
            if val is None or val == '':
                return default
            try:
                return float(val)
            except (ValueError, TypeError):
                return default
        
        remaining = safe_float(inv.get('amount')) - safe_float(inv.get('paid_amount'))
        total_receivable += remaining
        
        days_overdue = (today - due_date).days
        
        # Get subscriber name - from invoice or lookup from subscribers collection
        subscriber_id = inv.get('subscriber_id', '')
        subscriber_name = inv.get('subscriber_name') or subscriber_names.get(subscriber_id, '')
        
        invoice_summary = {
            "invoice_number": inv.get('invoice_number'),
            "subscriber_id": subscriber_id,
            "subscriber_name": subscriber_name,
            "amount": remaining,
            "due_date": due_date.strftime('%Y-%m-%d'),
            "days_overdue": max(0, days_overdue)
        }
        
        if days_overdue <= 0:
            aging["current"]["count"] += 1
            aging["current"]["amount"] += remaining
            aging["current"]["invoices"].append(invoice_summary)
        elif days_overdue <= 30:
            aging["1_30_days"]["count"] += 1
            aging["1_30_days"]["amount"] += remaining
            aging["1_30_days"]["invoices"].append(invoice_summary)
        elif days_overdue <= 60:
            aging["31_60_days"]["count"] += 1
            aging["31_60_days"]["amount"] += remaining
            aging["31_60_days"]["invoices"].append(invoice_summary)
        elif days_overdue <= 90:
            aging["61_90_days"]["count"] += 1
            aging["61_90_days"]["amount"] += remaining
            aging["61_90_days"]["invoices"].append(invoice_summary)
        else:
            aging["over_90_days"]["count"] += 1
            aging["over_90_days"]["amount"] += remaining
            aging["over_90_days"]["invoices"].append(invoice_summary)
    
    return {
        "total_receivable": total_receivable,
        "aging": aging,
        "generated_at": today.isoformat()
    }

@api_router.get("/reports/collections")
async def get_collections_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get collections report filtered by date range.
    """
    if current_user['role'] not in ['admin', 'billing', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build date filter
    query = {}
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            query["payment_date"] = {"$gte": start_dt}
        except:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            end_dt = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            if "payment_date" in query:
                query["payment_date"]["$lte"] = end_dt
            else:
                query["payment_date"] = {"$lte": end_dt}
        except:
            pass
    
    # If no date filter, default to today
    if not query:
        today = get_ph_now().replace(hour=0, minute=0, second=0, microsecond=0)
        query["payment_date"] = {"$gte": today}
    
    # Get payments
    payments = await db.payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(10000)
    
    # Calculate totals by payment mode
    by_mode = {}
    total_amount = 0
    
    for p in payments:
        mode = p.get('payment_mode') or p.get('mode', 'unknown')
        amount = p.get('total_amount', p.get('amount', 0))
        
        if mode not in by_mode:
            by_mode[mode] = {"count": 0, "amount": 0}
        
        by_mode[mode]["count"] += 1
        by_mode[mode]["amount"] += amount
        total_amount += amount
    
    return {
        "total_amount": total_amount,
        "total_count": len(payments),
        "by_mode": by_mode,
        "payments": payments[:100],  # Limit to 100 for display
        "start_date": start_date,
        "end_date": end_date
    }

@api_router.get("/reports/collections-by-collector")
async def get_collections_by_collector(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get collections grouped by collector (received_by) for chart display.
    """
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build date filter
    match_filter = {}
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            match_filter["payment_date"] = {"$gte": start_dt}
        except:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            end_dt = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            if "payment_date" in match_filter:
                match_filter["payment_date"]["$lte"] = end_dt
            else:
                match_filter["payment_date"] = {"$lte": end_dt}
        except:
            pass
    
    # If no date filter, default to current month
    if not match_filter:
        now = get_ph_now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        match_filter["payment_date"] = {"$gte": month_start}
    
    # Aggregate by collector
    pipeline = [
        {"$match": match_filter},
        {"$group": {
            "_id": "$received_by",
            "total_amount": {"$sum": {"$ifNull": ["$total_amount", {"$ifNull": ["$amount", 0]}]}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"total_amount": -1}}
    ]
    
    results = await db.payments.aggregate(pipeline).to_list(100)
    
    # Format for chart
    collectors = []
    total = 0
    
    for r in results:
        collector_name = r['_id'] or 'Unknown'
        collectors.append({
            "name": collector_name,
            "amount": r['total_amount'],
            "count": r['count']
        })
        total += r['total_amount']
    
    return {
        "collectors": collectors,
        "total_amount": total,
        "total_count": sum(c['count'] for c in collectors),
        "start_date": start_date,
        "end_date": end_date
    }

# ========== IMPORT/EXPORT MODULE ==========

@api_router.get("/export/subscribers")
async def export_subscribers(current_user: dict = Depends(get_current_user)):
    """Export all subscribers to CSV"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    subscribers = await db.subscribers.find({}, {"_id": 0}).to_list(10000)
    
    # Define CSV columns
    columns = [
        'account_number', 'first_name', 'last_name', 'email', 'contact_number',
        'address', 'barangay', 'municipality', 'province',
        'plan_name', 'plan_id', 'plan_amount', 'billing_day', 'status',
        'pppoe_username', 'pppoe_password', 'pppoe_profile', 'pppoe_activated',
        'mac_address', 'installation_date', 'created_at'
    ]
    
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    
    for sub in subscribers:
        # Flatten nested address if present
        row = {**sub}
        if 'address_details' in sub:
            addr = sub.get('address_details', {})
            row['barangay'] = addr.get('barangay', sub.get('barangay', ''))
            row['municipality'] = addr.get('municipality', sub.get('municipality', ''))
            row['province'] = addr.get('province', sub.get('province', ''))
        # Ensure plan_name is set from plan_id if missing
        if not row.get('plan_name') and row.get('plan_id'):
            row['plan_name'] = row['plan_id']
        # Map phone to contact_number for export
        if not row.get('contact_number') and row.get('phone'):
            row['contact_number'] = row['phone']
        writer.writerow(row)
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=subscribers_{get_ph_now().strftime('%Y%m%d')}.csv"}
    )

@api_router.post("/import/subscribers")
async def import_subscribers(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Import subscribers from CSV"""
    if current_user['role'] not in ['admin']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")
    
    content = await file.read()
    decoded = content.decode('utf-8-sig')  # Handle BOM
    reader = csv.DictReader(StringIO(decoded))
    
    imported = 0
    updated = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):  # Start at 2 to account for header
        try:
            account_number = row.get('account_number', '').strip()
            
            if not account_number:
                # Generate new account number if not provided
                account_number = f"ACC{uuid.uuid4().hex[:8].upper()}"
            
            # Check if subscriber exists
            existing = await db.subscribers.find_one({"account_number": account_number})
            
            subscriber_data = {
                "account_number": account_number,
                "first_name": row.get('first_name', '').strip(),
                "last_name": row.get('last_name', '').strip(),
                "email": row.get('email', '').strip(),
                "phone": row.get('contact_number', '').strip(),  # Map to 'phone' field used by UI
                "contact_number": row.get('contact_number', '').strip(),  # Keep for compatibility
                "address": row.get('address', '').strip(),
                "barangay": row.get('barangay', '').strip(),
                "municipality": row.get('municipality', '').strip(),
                "province": row.get('province', '').strip(),
                "plan_id": row.get('plan_name', '').strip(),  # Map plan_name to plan_id
                "plan_name": row.get('plan_name', '').strip(),
                "plan_amount": float(row.get('plan_amount', 0) or 0),
                "billing_day": int(row.get('billing_day', 1) or 1),
                "status": row.get('status', 'active').strip().lower(),
                "is_active": row.get('status', 'active').strip().lower() == 'active',
                "pppoe_username": row.get('pppoe_username', '').strip(),
                "pppoe_password": row.get('pppoe_password', '').strip(),
                "pppoe_profile": row.get('pppoe_profile', '').strip(),
                "pppoe_activated": row.get('pppoe_activated', '').strip().lower() in ['true', 'yes', '1', 'activated'],
                "mac_address": row.get('mac_address', '').strip(),
            }
            
            # Handle installation_date if provided
            install_date = row.get('installation_date', '').strip()
            if install_date:
                subscriber_data["installation_date"] = install_date
            
            if existing:
                # Update existing
                await db.subscribers.update_one(
                    {"account_number": account_number},
                    {"$set": {**subscriber_data, "updated_at": get_ph_now().isoformat()}}
                )
                updated += 1
            else:
                # Insert new
                subscriber_data["created_at"] = get_ph_now().isoformat()
                subscriber_data["portal_password"] = "0000"  # Default password
                await db.subscribers.insert_one(subscriber_data)
                imported += 1
                
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    return {
        "message": f"Import complete: {imported} new, {updated} updated",
        "imported": imported,
        "updated": updated,
        "errors": errors[:10]  # Return first 10 errors
    }

@api_router.get("/export/payments")
async def export_payments(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export payment history to CSV"""
    if current_user['role'] not in ['admin', 'billing', 'cashier']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build query
    query = {}
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query["payment_date"] = {"$gte": start_dt}
        except:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            end_dt = end_dt.replace(hour=23, minute=59, second=59)
            if "payment_date" in query:
                query["payment_date"]["$lte"] = end_dt
            else:
                query["payment_date"] = {"$lte": end_dt}
        except:
            pass
    
    payments = await db.payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(50000)
    
    # Define CSV columns
    columns = [
        'or_number', 'payment_date', 'subscriber_id', 'subscriber_name',
        'total_amount', 'payment_mode', 'received_by', 'description',
        'invoices_settled', 'wallet_credit'
    ]
    
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    
    for p in payments:
        row = {**p}
        # Format payment date
        if isinstance(p.get('payment_date'), datetime):
            row['payment_date'] = p['payment_date'].strftime('%Y-%m-%d %H:%M:%S')
        # Format invoices settled as comma-separated
        invoices = p.get('invoices_settled', [])
        if isinstance(invoices, list):
            # Handle both string list and dict list (invoice_number field)
            if invoices and isinstance(invoices[0], dict):
                row['invoices_settled'] = ', '.join([inv.get('invoice_number', str(inv)) for inv in invoices])
            else:
                row['invoices_settled'] = ', '.join([str(inv) for inv in invoices])
        # Use payment_mode or mode
        row['payment_mode'] = p.get('payment_mode') or p.get('mode', '')
        writer.writerow(row)
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=payments_{get_ph_now().strftime('%Y%m%d')}.csv"}
    )

@api_router.get("/export/expenses")
async def export_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export expenses to CSV"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build query - use expense_date field
    query = {}
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query["expense_date"] = {"$gte": start_dt}
        except:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "expense_date" in query:
                query["expense_date"]["$lte"] = end_dt
            else:
                query["expense_date"] = {"$lte": end_dt}
        except:
            pass
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("expense_date", -1).to_list(50000)
    
    # Define CSV columns - use expense_date to match database
    columns = [
        'expense_id', 'expense_date', 'category', 'description', 'amount',
        'payment_method', 'vendor', 'reference_number', 'notes', 'created_by'
    ]
    
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    
    for exp in expenses:
        row = {**exp}
        # Format expense_date if it's a datetime
        if isinstance(exp.get('expense_date'), datetime):
            row['expense_date'] = exp['expense_date'].strftime('%Y-%m-%d')
        writer.writerow(row)
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=expenses_{get_ph_now().strftime('%Y%m%d')}.csv"}
    )

@api_router.post("/import/expenses")
async def import_expenses(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Import expenses from CSV"""
    if current_user['role'] not in ['admin']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")
    
    content = await file.read()
    decoded = content.decode('utf-8-sig')
    reader = csv.DictReader(StringIO(decoded))
    
    imported = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            expense_id = row.get('expense_id', '').strip()
            if not expense_id:
                expense_id = f"EXP{uuid.uuid4().hex[:8].upper()}"
            
            # Check if expense exists
            existing = await db.expenses.find_one({"expense_id": expense_id})
            if existing:
                errors.append(f"Row {row_num}: Expense {expense_id} already exists")
                continue
            
            expense_data = {
                "expense_id": expense_id,
                "expense_date": row.get('expense_date', row.get('date', get_ph_now().strftime('%Y-%m-%d'))).strip(),
                "category": row.get('category', 'Other').strip(),
                "description": row.get('description', '').strip(),
                "amount": float(row.get('amount', 0) or 0),
                "payment_method": row.get('payment_method', 'cash').strip(),
                "vendor": row.get('vendor', '').strip(),
                "reference_number": row.get('reference_number', '').strip(),
                "notes": row.get('notes', '').strip(),
                "created_by": current_user['username'],
                "created_at": get_ph_now().isoformat()
            }
            
            await db.expenses.insert_one(expense_data)
            imported += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    return {
        "message": f"Import complete: {imported} expenses imported",
        "imported": imported,
        "errors": errors[:10]
    }

@api_router.get("/export/invoices")
async def export_invoices(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export invoices to CSV"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build query
    query = {}
    if start_date:
        try:
            query["created_at"] = {"$gte": start_date}
        except:
            pass
    if end_date:
        try:
            if "created_at" in query:
                query["created_at"]["$lte"] = end_date
            else:
                query["created_at"] = {"$lte": end_date}
        except:
            pass
    if status:
        if status.lower() == 'paid':
            query["paid"] = True
        elif status.lower() == 'unpaid':
            query["paid"] = False
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(50000)
    
    # Define CSV columns
    columns = [
        'invoice_number', 'subscriber_id', 'subscriber_name', 'description',
        'amount', 'paid_amount', 'paid', 'due_date', 'billing_period_start',
        'billing_period_end', 'invoice_type', 'created_at'
    ]
    
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    
    for inv in invoices:
        row = {**inv}
        # Format dates
        for date_field in ['due_date', 'billing_period_start', 'billing_period_end', 'created_at']:
            if isinstance(inv.get(date_field), datetime):
                row[date_field] = inv[date_field].strftime('%Y-%m-%d')
        writer.writerow(row)
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=invoices_{get_ph_now().strftime('%Y%m%d')}.csv"}
    )

@api_router.post("/import/invoices")
async def import_invoices(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Import invoices from CSV"""
    if current_user['role'] not in ['admin']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")
    
    content = await file.read()
    decoded = content.decode('utf-8-sig')
    reader = csv.DictReader(StringIO(decoded))
    
    imported = 0
    updated = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            invoice_number = row.get('invoice_number', '').strip()
            subscriber_id = row.get('subscriber_id', '').strip()
            
            if not subscriber_id:
                errors.append(f"Row {row_num}: subscriber_id is required")
                continue
            
            if not invoice_number:
                # Generate invoice number
                invoice_number = f"INV{get_ph_now().strftime('%Y%m%d')}{uuid.uuid4().hex[:6].upper()}"
            
            # Check if invoice exists
            existing = await db.invoices.find_one({"invoice_number": invoice_number})
            
            # Get subscriber name if not provided
            subscriber_name = row.get('subscriber_name', '').strip()
            if not subscriber_name:
                sub = await db.subscribers.find_one({"account_number": subscriber_id})
                if sub:
                    subscriber_name = f"{sub.get('first_name', '')} {sub.get('last_name', '')}".strip()
            
            amount = float(row.get('amount', 0) or 0)
            paid_amount = float(row.get('paid_amount', 0) or 0)
            paid_str = row.get('paid', '').strip().lower()
            is_paid = paid_str in ['true', 'yes', '1'] or paid_amount >= amount
            
            invoice_data = {
                "invoice_number": invoice_number,
                "subscriber_id": subscriber_id,
                "subscriber_name": subscriber_name,
                "description": row.get('description', '').strip(),
                "amount": amount,
                "paid_amount": paid_amount,
                "paid": is_paid,
                "due_date": row.get('due_date', '').strip(),
                "billing_period_start": row.get('billing_period_start', '').strip(),
                "billing_period_end": row.get('billing_period_end', '').strip(),
                "invoice_type": row.get('invoice_type', 'monthly').strip(),
            }
            
            if existing:
                await db.invoices.update_one(
                    {"invoice_number": invoice_number},
                    {"$set": {**invoice_data, "updated_at": get_ph_now().isoformat()}}
                )
                updated += 1
            else:
                invoice_data["created_at"] = get_ph_now().isoformat()
                await db.invoices.insert_one(invoice_data)
                imported += 1
                
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    return {
        "message": f"Import complete: {imported} new, {updated} updated",
        "imported": imported,
        "updated": updated,
        "errors": errors[:10]
    }

@api_router.post("/import/payments")
async def import_payments(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Import payment records from CSV (for historical data migration)"""
    if current_user['role'] not in ['admin']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")
    
    content = await file.read()
    decoded = content.decode('utf-8-sig')
    reader = csv.DictReader(StringIO(decoded))
    
    imported = 0
    skipped = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            or_number = row.get('or_number', '').strip()
            subscriber_id = row.get('subscriber_id', '').strip()
            
            if not subscriber_id:
                errors.append(f"Row {row_num}: subscriber_id is required")
                continue
            
            if not or_number:
                # Generate OR number
                or_number = f"OR{get_ph_now().strftime('%Y%m%d')}{uuid.uuid4().hex[:6].upper()}"
            
            # Check if payment exists
            existing = await db.payments.find_one({"or_number": or_number})
            if existing:
                skipped += 1
                continue
            
            # Get subscriber name if not provided
            subscriber_name = row.get('subscriber_name', '').strip()
            if not subscriber_name:
                sub = await db.subscribers.find_one({"account_number": subscriber_id})
                if sub:
                    subscriber_name = f"{sub.get('first_name', '')} {sub.get('last_name', '')}".strip()
            
            # Parse payment date
            payment_date_str = row.get('payment_date', '').strip()
            if payment_date_str:
                try:
                    payment_date = datetime.fromisoformat(payment_date_str.replace('Z', '+00:00'))
                except:
                    try:
                        payment_date = datetime.strptime(payment_date_str, '%Y-%m-%d %H:%M:%S')
                    except:
                        try:
                            payment_date = datetime.strptime(payment_date_str, '%Y-%m-%d')
                        except:
                            payment_date = get_ph_now()
            else:
                payment_date = get_ph_now()
            
            payment_data = {
                "or_number": or_number,
                "subscriber_id": subscriber_id,
                "subscriber_name": subscriber_name,
                "total_amount": float(row.get('total_amount', 0) or 0),
                "payment_mode": row.get('payment_mode', 'cash').strip(),
                "mode": row.get('payment_mode', 'cash').strip(),
                "payment_date": payment_date,
                "received_by": row.get('received_by', 'Imported').strip(),
                "description": row.get('description', 'Imported payment').strip(),
                "invoices_settled": row.get('invoices_settled', '').strip().split(',') if row.get('invoices_settled') else [],
                "imported": True,
                "imported_at": get_ph_now().isoformat(),
                "imported_by": current_user['username']
            }
            
            await db.payments.insert_one(payment_data)
            imported += 1
                
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    return {
        "message": f"Import complete: {imported} payments imported, {skipped} skipped (already exist)",
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:10]
    }

@api_router.get("/export/template/{type}")
async def get_import_template(type: str, current_user: dict = Depends(get_current_user)):
    """Get CSV template for import"""
    if current_user['role'] not in ['admin', 'billing']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    templates = {
        "subscribers": [
            'account_number', 'first_name', 'last_name', 'email', 'contact_number',
            'address', 'barangay', 'municipality', 'province',
            'plan_name', 'plan_amount', 'billing_day', 'status',
            'pppoe_username', 'pppoe_password', 'pppoe_profile', 'pppoe_activated',
            'mac_address', 'installation_date'
        ],
        "expenses": [
            'expense_id', 'expense_date', 'category', 'description', 'amount',
            'payment_method', 'vendor', 'reference_number', 'notes'
        ],
        "invoices": [
            'invoice_number', 'subscriber_id', 'subscriber_name', 'description',
            'amount', 'paid_amount', 'paid', 'due_date', 'billing_period_start',
            'billing_period_end', 'invoice_type'
        ],
        "payments": [
            'or_number', 'payment_date', 'subscriber_id', 'subscriber_name',
            'total_amount', 'payment_mode', 'received_by', 'description', 'invoices_settled'
        ]
    }
    
    if type not in templates:
        raise HTTPException(status_code=400, detail=f"Invalid template type. Available: {list(templates.keys())}")
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(templates[type])
    # Add sample row
    if type == "subscribers":
        writer.writerow(['', 'John', 'Doe', 'john@example.com', '09123456789',
                        '123 Main St', 'Barangay 1', 'City', 'Province',
                        'Plan A', '999', '1', 'active', 
                        'johndoe', 'password123', 'default', 'true',
                        '', '2026-01-15'])
    elif type == "expenses":
        writer.writerow(['', '2026-02-24', 'Utilities', 'Electric Bill', '1500',
                        'cash', 'Meralco', '', ''])
    elif type == "invoices":
        writer.writerow(['', 'ACC123456', 'John Doe', 'Monthly Bill - February 2026',
                        '999', '0', 'false', '2026-02-28', '2026-02-01', '2026-02-28', 'monthly'])
    elif type == "payments":
        writer.writerow(['', '2026-02-24', 'ACC123456', 'John Doe',
                        '999', 'cash', 'cashier1', 'Monthly payment', 'INV20260224ABC123'])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={type}_template.csv"}
    )

# Include router (MUST be after all route definitions)
app.include_router(api_router)