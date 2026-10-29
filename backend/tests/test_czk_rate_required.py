"""A foreign-currency amount is never stored without its CZK rate (a missing rate was read as 1)."""
import pytest

from app.services.portfolio_accounting import require_czk_rate


@pytest.mark.parametrize("currency", ["CZK", "czk"])
def test_czech_crowns_need_no_rate(currency):
    require_czk_rate(currency, None)


@pytest.mark.parametrize("currency", ["USD", "EUR", "GBP", "usd"])
@pytest.mark.parametrize("rate", [None, 0, 0.0])
def test_a_foreign_currency_without_a_rate_is_refused(currency, rate):
    with pytest.raises(ValueError, match="kurz"):
        require_czk_rate(currency, rate)


def test_the_message_names_the_currency():
    with pytest.raises(ValueError, match="USD"):
        require_czk_rate("USD", None)


def test_a_foreign_currency_with_a_rate_is_accepted():
    require_czk_rate("USD", 22.5)


def test_an_unspecified_currency_is_treated_as_usd_like_the_services_do():
    with pytest.raises(ValueError):
        require_czk_rate(None, None)
