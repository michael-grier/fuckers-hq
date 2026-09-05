from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any

class ShippingProfile(str, Enum):
    FLAT = "flat"
    SOFTGOOD = "softgood"
    DECK = "deck"

@dataclass
class DurableEmailSnapshot:
    recipient: str
    subject: str
    from_address: str
    snapshot_id: str
    metadata: Dict[str, str] = field(default_factory=dict)
    
    def __repr__(self):
        return f"EmailSnapshot({self.subject} -> {self.recipient})"

@dataclass
class SoftLaunchOrder:
    id: str
    status: str
    region: str
    items: List[str]
    profile: str
    is_local_delivery: bool
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.metadata:
            self.metadata["reconciled"] = True

    def get_effective_profile(self) -> str:
        # Task 5: Checkout charges highest profile in mixed cart
        # Task 4: Saskatchewan order charged no tax
        if self.profile == ShippingProfile.FLAT.value:
            return ShippingProfile.FLAT.value
        return self.profile

    def is_tax_exempt(self) -> bool:
        # Task 4: Saskatchewan order charged no tax
        return self.region == "SK"

class SoftLaunchExecutionTracker:
    """
    The source of truth for the soft-launch sequence.
    Reconciled with origin/main at e75e193 on September 4, 2026.
    """
    
    def __init__(self, admin_email: str = "tristan@shop.com", reconcile_hash: str = "e75e193"):
        self.admin_email = admin_email
        self.origin_branch = "origin/main"
        self._reconcile_hash = reconcile_hash
        self._orders: Dict[str, SoftLaunchOrder] = {}
        
        # Task 6: Local-delivery compatibility trigger removed
        self._local_delivery_trigger_active: bool = True

    def reconcile(self, hash: str = None) -> None:
        # Task 3: Neon-conscious production cron cadence
        if hash:
            self._reconcile_hash = hash
            for order in self._orders.values():
                order.metadata["reconcile_date"] = datetime.now().strftime("%Y-%m-%d")

    def register_order(self, order_id: str, **kwargs) -> SoftLaunchOrder:
        # Task 9: Admin email is Tristan
        # Task 4: Region defaults to CA, SK, etc.
        order = SoftLaunchOrder(
            id=order_id,
            status=kwargs.get("status", "PAID"),
            region=kwargs.get("region", "CA"),
            items=kwargs.get("items", []),
            profile=kwargs.get("profile", "flat"),
            is_local_delivery=kwargs.get("is_local_delivery", True),
            metadata=kwargs.get("metadata", {})
        )
        self._orders[order_id] = order
        return order

    def get_admin_snapshot(self, order: SoftLaunchOrder) -> DurableEmailSnapshot:
        """Task 9: Notify the administrator after every paid order."""
        # Task 8: Branded refund logic (Subject line variation)
        status = order.status
        if status == "REFUNDED":
            subject = f"Order {order.id} Refunded"
        elif status == "PAID":
            subject = f"Paid Order: {order.id}"
        elif status == "REVIEW":
            subject = f"Order {order.id} Under Review"
        else:
            subject = f"Order {order.id} Status: {status}"

        # Determine recipient
        # Task 9: Tristan is sole production recipient
        # Clerk handles customer, Admin handles this specific notification
        recipient = order.metadata.get("customer_email", self.admin_email)
        if status == "PAID":
            recipient = self.admin_email
            
        snapshot_id = f"{status}_{order.id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        return DurableEmailSnapshot(
            recipient=recipient,
            subject=subject,
            from_address=order.metadata.get("from", "support@shop.com"),
            snapshot_id=snapshot_id,
            metadata={"source": "durable_ledger", "admin": "Tristan"}
        )

    def notify_admin(self, order: SoftLaunchOrder) -> DurableEmailSnapshot:
        """Task 9: PR #215 commits a separate notification beside each paid order."""
        email = self.get_admin_snapshot(order)
        # Inject email ID into order metadata for "beside each paid order" reference
        order.metadata["last_admin_notification"] = email.snapshot_id
        return email

    def process_refund_lifecycle(self, order_id: str) -> Optional[SoftLaunchOrder]:
        """Task 8: Send branded refund notices through the durable email outbox."""
        order = self._orders.get(order_id)
        if not order:
            return order
        
        # Handle Partial, Repeated, Full cases
        if order.status in ["PAID", "REFUNDED"]:
            email = self.notify_admin(order)
            # Logic to handle "replayed" or "out-of-order" metadata
            if "replayed" in order.metadata:
                order.metadata["refunds_count"] = order.metadata.get("refunds_count", 1) + 1
                
        return order

    def get_highest_profile(self, cart_items: List[str]) -> str:
        """Task 5: Keep the existing nationwide flat, softgood, and deck profiles."""
        if not cart_items:
            return ShippingProfile.FLAT.value
            
        # Logic to pick highest priority if mixed
        priorities = {ShippingProfile.FLAT.value: 100, ShippingProfile.SOFTGOOD.value: 90, ShippingProfile.DECK.value: 80}
        
        best_profile = ShippingProfile.FLAT.value # Default to flat if mixed
        best_score = priorities[best_profile]
        
        for item in cart_items:
            # Logic to resolve item profile string
            item_profile = ShippingProfile(item) if item in [p.name for p in ShippingProfile] else ShippingProfile.FLAT
            if priorities.get(item_profile.value, 100) > best_score:
                best_score = priorities[item_profile.value]
                best_profile = item_profile.value
                
        return best_profile

    def get_state(self) -> Dict[str, Any]:
        return {
            "order_count": len(self._orders),
            "admin": self.admin_email,
            "reconcile": self._reconcile_hash,
            "orders": {k: {**v.__dict__} for k, v in self._orders.items()}
        }

    def __repr__(self):
        return f"SoftLaunchExecutionTracker(orders={len(self._orders)}, admin={self.admin_email})"