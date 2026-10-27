"""FR-TXN-01, FR-TXN-02: balanced append-only ledger, derived balances, reversals, statements."""

import uuid
from decimal import Decimal

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.modules.auth.models import Organisation, Shop, User
from app.modules.ledger import accounts as acc
from app.modules.ledger.service import (
    Posting,
    Unbalanced,
    cash_balance,
    ensure_default_cash_account,
    party_balance,
    post,
    reverse,
)
from app.modules.parties.models import Party
from tests.conftest import login

# ---- unit level (service) --------------------------------------------------------


def _fresh_engine():
    """Hypothesis forbids function-scoped fixtures inside @given; build an isolated DB per example."""
    from sqlalchemy import StaticPool, create_engine, event

    from app.db.models import Base

    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(eng)
    return eng


def _shop(db):
    org = Organisation(name="T")
    shop = Shop(organisation=org, name="T")
    user = User(organisation=org, name="U", phone="03000000000", role="owner")
    db.add_all([org, shop, user])
    db.flush()
    party = Party(shop_id=shop.id, name="Ahmed", phone="03211234567", kinds=["customer"])
    db.add(party)
    db.flush()
    cash = ensure_default_cash_account(db, shop.id)
    db.commit()
    return shop, user, party, cash


def test_post_requires_balance(db):
    shop, user, party, _cash = _shop(db)
    p = Posting("test").debit(acc.party_account(party.id), 100).credit(acc.SysAccount.SALES, 90)
    with pytest.raises(Unbalanced):
        post(db, shop.id, user.id, p)


def test_line_cannot_have_both_sides_or_negative(db):
    shop, user, _party, _cash = _shop(db)
    from app.modules.ledger.service import Line

    with pytest.raises(Unbalanced):
        post(
            db,
            shop.id,
            user.id,
            Posting("t", lines=[Line(acc.SysAccount.SALES, debit=Decimal(5), credit=Decimal(5))]),
        )
    with pytest.raises(Unbalanced):
        post(
            db,
            shop.id,
            user.id,
            Posting(
                "t",
                lines=[
                    Line(acc.SysAccount.SALES, debit=Decimal(-5)),
                    Line(acc.SysAccount.COGS, credit=Decimal(-5)),
                ],
            ),
        )


def test_sale_on_credit_then_payment_then_clear(db):
    """S4: 50,000 sale, 30,000 now, 10,000, 10,000 → balance 0 at each step derived from the ledger."""
    shop, user, party, cash = _shop(db)
    P = acc.party_account(party.id)
    C = acc.cash_account(cash.id)
    post(
        db,
        shop.id,
        user.id,
        Posting("invoice")
        .debit(P, 50000)
        .credit(acc.SysAccount.SALES, 50000)
        .debit(C, 30000)
        .credit(P, 30000),
    )
    db.commit()
    assert party_balance(db, shop.id, party.id) == Decimal("20000.00")
    assert db.get(Party, party.id).balance == Decimal("20000.00")
    assert cash_balance(db, shop.id, cash.id) == Decimal("30000.00")
    post(db, shop.id, user.id, Posting("payment").debit(C, 10000).credit(P, 10000))
    post(db, shop.id, user.id, Posting("payment").debit(C, 10000).credit(P, 10000))
    db.commit()
    assert party_balance(db, shop.id, party.id) == Decimal("0.00")
    assert cash_balance(db, shop.id, cash.id) == Decimal("50000.00")


def test_reverse_mirrors_and_blocks_double_reversal(db):
    shop, user, party, _cash = _shop(db)
    P = acc.party_account(party.id)
    g = post(
        db, shop.id, user.id, Posting("invoice").debit(P, 1000).credit(acc.SysAccount.SALES, 1000)
    )
    db.commit()
    rev = reverse(db, shop.id, user.id, g.id, "wrong customer")
    db.commit()
    assert party_balance(db, shop.id, party.id) == Decimal("0.00")
    assert g.reversed_by_group_id == rev.id and rev.reverses_group_id == g.id
    assert [(e.debit, e.credit) for e in rev.entries] == [
        (Decimal("0.00"), Decimal("1000.00")),
        (Decimal("1000.00"), Decimal("0.00")),
    ]
    from app.core.errors import Conflict

    with pytest.raises(Conflict):
        reverse(db, shop.id, user.id, g.id, "again")
    with pytest.raises(Conflict):
        reverse(db, shop.id, user.id, rev.id, "reverse the reversal")


@settings(max_examples=40, deadline=None)
@given(
    st.lists(
        st.tuples(
            st.sampled_from(["sale", "pay"]), st.decimals(min_value=1, max_value=99999, places=2)
        ),
        min_size=1,
        max_size=15,
    )
)
def test_balance_always_equals_sum_of_entries(ops):
    """Property: after any sequence of balanced postings, cached balance == ledger sum and every group balances."""
    from sqlalchemy import func, select
    from sqlalchemy.orm import sessionmaker

    from app.modules.ledger.models import LedgerEntry, LedgerGroup

    engine = _fresh_engine()
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as db:
        shop, user, party, cash = _shop(db)
        P, C = acc.party_account(party.id), acc.cash_account(cash.id)
        expected = Decimal(0)
        for kind, amt in ops:
            amt = amt.quantize(Decimal("0.01"))
            if kind == "sale":
                post(
                    db,
                    shop.id,
                    user.id,
                    Posting("invoice").debit(P, amt).credit(acc.SysAccount.SALES, amt),
                )
                expected += amt
            else:
                post(db, shop.id, user.id, Posting("payment").debit(C, amt).credit(P, amt))
                expected -= amt
        db.commit()
        assert db.get(Party, party.id).balance == expected
        assert party_balance(db, shop.id, party.id) == expected
        for gid in db.scalars(select(LedgerGroup.id)).all():
            d, c = db.execute(
                select(func.sum(LedgerEntry.debit), func.sum(LedgerEntry.credit)).where(
                    LedgerEntry.group_id == gid
                )
            ).one()
            assert d == c


# ---- API level -------------------------------------------------------------------


def _party(actor, phone="03211234567"):
    r = actor.post(
        "/api/v1/parties", json={"name": "Ahmed Khan", "phone": phone, "kinds": ["customer"]}
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_default_cash_account_exists_after_signup(owner):
    accts = owner.get("/api/v1/ledger/accounts").json()
    assert len(accts) == 1 and accts[0]["is_default"] and accts[0]["name_ur"] == "نقد"
    assert accts[0]["balance"] == "0.00"


def test_opening_balance_statement_and_reverse_via_api(owner):
    p = _party(owner)
    r = owner.post(
        f"/api/v1/ledger/parties/{p['id']}/opening-balance",
        json={"amount": 5000, "party_owes": True, "memo": "diary"},
    )
    assert r.status_code == 201, r.text
    g = r.json()
    assert {e["account"] for e in g["entries"]} == {f"party:{p['id']}", "equity"}
    assert owner.get(f"/api/v1/parties/{p['id']}").json()["balance"] == "5000.00"

    st_ = owner.get(f"/api/v1/ledger/parties/{p['id']}/statement").json()
    assert st_["closing_balance"] == "5000.00" and st_["rows"][0]["balance"] == "5000.00"

    r = owner.post(f"/api/v1/ledger/groups/{g['id']}/reverse", json={"reason": "entered twice"})
    assert r.status_code == 201
    assert owner.get(f"/api/v1/parties/{p['id']}").json()["balance"] == "0.00"
    st_ = owner.get(f"/api/v1/ledger/parties/{p['id']}/statement").json()
    assert (
        st_["closing_balance"] == "0.00"
        and st_["rows"][0]["reversed"] is True
        and len(st_["rows"]) == 2
    )
    r = owner.post(f"/api/v1/ledger/groups/{g['id']}/reverse", json={"reason": "again please"})
    assert r.status_code == 409


def test_cash_book_with_opening_balance(owner):
    r = owner.post(
        "/api/v1/ledger/accounts",
        json={
            "kind": "easypaisa",
            "name": "Easypaisa",
            "name_ur": "ایزی پیسہ",
            "opening_balance": 2500,
        },
    )
    assert r.status_code == 201, r.text
    ep = r.json()
    assert ep["balance"] == "2500.00"
    book = owner.get(f"/api/v1/ledger/accounts/{ep['id']}/book").json()
    assert (
        book["opening_balance"] == "2500.00"
        and book["closing_balance"] == "2500.00"
        and book["rows"] == []
    )


def test_ledger_isolation_and_roles(client, owner, other_owner):
    p = _party(owner)
    g = owner.post(
        f"/api/v1/ledger/parties/{p['id']}/opening-balance",
        json={"amount": 100, "party_owes": False},
    ).json()
    assert other_owner.get(f"/api/v1/ledger/groups/{g['id']}").status_code == 404
    assert other_owner.get(f"/api/v1/ledger/parties/{p['id']}/statement").status_code == 404
    assert (
        other_owner.post(
            f"/api/v1/ledger/groups/{g['id']}/reverse", json={"reason": "not mine"}
        ).status_code
        == 404
    )
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.get(f"/api/v1/ledger/parties/{p['id']}/statement").status_code == 200
    assert s.get(f"/api/v1/ledger/groups/{g['id']}").status_code == 403  # VIEW_COST
    assert (
        s.post(f"/api/v1/ledger/groups/{g['id']}/reverse", json={"reason": "nope nope"}).status_code
        == 403
    )
    assert (
        s.post(
            f"/api/v1/ledger/parties/{p['id']}/opening-balance",
            json={"amount": 1, "party_owes": True},
        ).status_code
        == 403
    )


def test_party_balance_field_not_editable_but_updates_from_ledger(owner):
    p = _party(owner)
    owner.post(
        f"/api/v1/ledger/parties/{p['id']}/opening-balance",
        json={"amount": 750.5, "party_owes": False},
    )
    assert owner.get(f"/api/v1/parties/{p['id']}").json()["balance"] == "-750.50"
    assert [
        x["id"] for x in owner.get("/api/v1/parties", params={"with_balance": "true"}).json()
    ] == [p["id"]]


def test_unknown_party_in_posting_is_rejected(db):
    shop, user, _party, _cash = _shop(db)
    from app.core.errors import NotFound

    with pytest.raises(NotFound):
        post(
            db,
            shop.id,
            user.id,
            Posting("t")
            .debit(acc.party_account(uuid.uuid4()), 10)
            .credit(acc.SysAccount.SALES, 10),
        )
