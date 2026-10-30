"""Message templates, one language at a time (owner rule). `{amount}` style placeholders."""

TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "otp": {
        "en": {
            "subject": "Your code",
            "body": "{code} is your Mobile Shop code. It works for 10 minutes. Do not share it.",
        },
        "ur": {
            "subject": "آپ کا کوڈ",
            "body": "{code} آپ کا Mobile Shop کوڈ ہے۔ 10 منٹ تک کام کرے گا۔ کسی کو نہ بتائیں۔",
        },
    },
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
    "repair_ready": {
        "en": {
            "subject": "Your {device} is ready",
            "body": "{customer}, your {device} ({repair_no}) is repaired and ready at {shop}. Bill: Rs. {total}{due_line}",
        },
        "ur": {
            "subject": "آپ کا {device} تیار ہے",
            "body": "{customer}، آپ کا {device} ({repair_no}) {shop} پر ٹھیک ہو کر تیار ہے۔ بل: Rs. {total}{due_line}",
        },
    },
    "udhaar_reminder": {
        "en": {
            "subject": "Reminder from {shop}",
            "body": "{customer}, a reminder from {shop}: Rs. {balance} is outstanding on your account. Please pay at your convenience. Thank you.",
        },
        "ur": {
            "subject": "{shop} کی طرف سے یاد دہانی",
            "body": "{customer}، {shop} کی طرف سے یاد دہانی: آپ کے کھاتے میں Rs. {balance} باقی ہیں۔ براہ کرم سہولت سے ادائیگی کر دیں۔ شکریہ۔",
        },
    },
    "daily_report": {
        "en": {
            "subject": "{shop}: hisaab of {date}",
            "body": (
                "{shop} – {date}\n"
                "Sold: {phones} phones, Rs. {sales}\n"
                "In hand (net): Rs. {cash}\n"
                "Given on udhaar: Rs. {udhaar_given} · Udhaar received: Rs. {udhaar_received}\n"
                "Expenses: Rs. {expenses}\n"
                "Profit: Rs. {profit}\n"
                "To get: Rs. {receivable} · To give: Rs. {payable}\n"
                "Phones in stock: {stock}\n"
                "Items low on stock: {low}"
            ),
        },
        "ur": {
            "subject": "{shop}: {date} کا حساب",
            "body": (
                "{shop} – {date}\n"
                "فروخت: {phones} فون، Rs. {sales}\n"
                "ہاتھ میں (صافی): Rs. {cash}\n"
                "ادھار پر دیا: Rs. {udhaar_given} · ادھار وصول: Rs. {udhaar_received}\n"
                "خرچے: Rs. {expenses}\n"
                "منافع: Rs. {profit}\n"
                "لینے ہیں: Rs. {receivable} · دینے ہیں: Rs. {payable}\n"
                "اسٹاک میں فون: {stock}\n"
                "کم اسٹاک چیزیں: {low}"
            ),
        },
    },
    "installment_due": {
        "en": {
            "subject": "Installment due: {shop}",
            "body": "{customer}, a reminder from {shop}: your installment of Rs. {amount} for {item} is due on {due}. Remaining after it: Rs. {remaining}. Thank you.",
        },
        "ur": {
            "subject": "قسط کی یاد دہانی: {shop}",
            "body": "{customer}، {shop} کی طرف سے یاد دہانی: {item} کی آپ کی Rs. {amount} کی قسط {due} کو بنتی ہے۔ اس کے بعد باقی: Rs. {remaining}۔ شکریہ۔",
        },
    },
    "installment_late": {
        "en": {
            "subject": "Installment overdue: {shop}",
            "body": "{customer}, your installment of Rs. {amount} for {item} was due on {due} ({late} days ago). Please pay at {shop} today. Remaining: Rs. {remaining}.",
        },
        "ur": {
            "subject": "قسط تاخیر سے: {shop}",
            "body": "{customer}، {item} کی آپ کی Rs. {amount} کی قسط {due} کو بنتی تھی ({late} دن ہو گئے)۔ براہ کرم آج {shop} پر ادا کر دیں۔ باقی: Rs. {remaining}۔",
        },
    },
    "shop_request_admin": {
        "en": {
            "subject": "New shop request: {shop}",
            "body": "New shop request from the website: {name}, {shop} ({city}), {phone}, plan {plan}. Open it in More → Super admin → Shop requests.",
        },
        "ur": {
            "subject": "نئی دکان کی درخواست: {shop}",
            "body": "ویب سائٹ سے نئی دکان کی درخواست: {name}، {shop} ({city})، {phone}، پلان {plan}۔ سپر ایڈمن ← دکان کی درخواستیں میں کھولیں۔",
        },
    },
    "fee_received": {
        "en": {
            "subject": "Fee received: {shop}",
            "body": "Thank you! Rs. {amount} received for {shop} ({months} month(s)). Your Mobile Shop subscription is paid until {until}.",
        },
        "ur": {
            "subject": "فیس وصول: {shop}",
            "body": "شکریہ! {shop} کے لیے Rs. {amount} وصول ہو گئے ({months} مہینے)۔ آپ کی Mobile Shop سبسکرپشن {until} تک ادا شدہ ہے۔",
        },
    },
    "password_request_admin": {
        "en": {
            "subject": "Password request: {shop}",
            "body": "Password reset request: {name} ({phone}), owner of {shop}, forgot the password. Set a new one in More → Super admin → the shop → Owner's password.",
        },
        "ur": {
            "subject": "پاس ورڈ کی درخواست: {shop}",
            "body": "پاس ورڈ کی درخواست: {shop} کے مالک {name} ({phone}) پاس ورڈ بھول گئے۔ سپر ایڈمن میں نیا پاس ورڈ رکھیں۔",
        },
    },
    "password_request_owner": {
        "en": {
            "subject": "{name} forgot the password",
            "body": "{name} ({phone}) of {shop} forgot their password. Set a new one in More → Staff → {name} → Reset password.",
        },
        "ur": {
            "subject": "{name} پاس ورڈ بھول گئے",
            "body": "{shop} کے {name} ({phone}) پاس ورڈ بھول گئے۔ مزید ← عملہ ← {name} ← پاس ورڈ ری سیٹ میں نیا پاس ورڈ رکھیں۔",
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
