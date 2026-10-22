"""Message templates, one language at a time (owner rule). `{amount}` style placeholders."""

TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "sale_customer": {
        "en": {
            "subject": "Receipt {invoice_no} from {shop}",
            "body": "Thank you {customer}! {shop} sold you {items} for Rs. {total}. Paid: Rs. {paid}. {balance_line}{pending_line}",
        },
        "ur": {
            "subject": "{shop} کی رسید {invoice_no}",
            "body": "شکریہ {customer}! {shop} نے آپ کو {items} Rs. {total} میں فروخت کیا۔ وصول: Rs. {paid}۔ {balance_line}{pending_line}",
        },
    },
    "sale_owner": {
        "en": {
            "subject": "Sale {invoice_no}: Rs. {total}",
            "body": "{staff} sold {items} to {customer} for Rs. {total} (paid Rs. {paid}, due Rs. {due}). Invoice {invoice_no}.",
        },
        "ur": {
            "subject": "فروخت {invoice_no}: Rs. {total}",
            "body": "{staff} نے {customer} کو {items} Rs. {total} میں فروخت کیا (وصول Rs. {paid}، باقی Rs. {due})۔ بل {invoice_no}۔",
        },
    },
    "purchase_owner": {
        "en": {
            "subject": "Stock added: {items}",
            "body": "{staff} added {count} item(s) from {party}: {items}. Total Rs. {total}, paid Rs. {paid}. {purchase_no}.",
        },
        "ur": {
            "subject": "اسٹاک شامل: {items}",
            "body": "{staff} نے {party} سے {count} چیز(یں) شامل کیں: {items}۔ کل Rs. {total}، ادا Rs. {paid}۔ {purchase_no}۔",
        },
    },
    "purchase_seller": {
        "en": {
            "subject": "Purchase confirmation {purchase_no}",
            "body": "{shop} bought {items} from you for Rs. {total}. Paid Rs. {paid}. Reference {purchase_no}.",
        },
        "ur": {
            "subject": "خریداری کی تصدیق {purchase_no}",
            "body": "{shop} نے آپ سے {items} Rs. {total} میں خریدا۔ ادا Rs. {paid}۔ حوالہ {purchase_no}۔",
        },
    },
    "payment_customer": {
        "en": {
            "subject": "Payment received {payment_no}",
            "body": "{shop} received Rs. {amount} from {customer}. {balance_line}",
        },
        "ur": {
            "subject": "ادائیگی وصول {payment_no}",
            "body": "{shop} نے {customer} سے Rs. {amount} وصول کیے۔ {balance_line}",
        },
    },
}

BALANCE_LINE = {
    "en": {
        "owes": "Remaining balance: Rs. {balance}.",
        "clear": "Your account is clear.",
        "advance": "You have Rs. {balance} credit with us.",
    },
    "ur": {
        "owes": "باقی بقایا: Rs. {balance}۔",
        "clear": "آپ کا کھاتہ صاف ہے۔",
        "advance": "آپ کے Rs. {balance} ہمارے پاس جمع ہیں۔",
    },
}

PENDING_LINE = {"en": " Pending for you: {pending}.", "ur": " آپ کے لیے باقی: {pending}۔"}


def render(key: str, lang: str, ctx: dict) -> tuple[str, str]:
    t = TEMPLATES[key].get(lang) or TEMPLATES[key]["en"]
    safe = {k: ("" if v is None else v) for k, v in ctx.items()}
    return t["subject"].format_map(_Default(safe)), t["body"].format_map(_Default(safe))


class _Default(dict):
    def __missing__(self, key):
        return ""
