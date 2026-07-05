from datetime import date

# Egyptian Exchange (EGX) Official Holidays 2025-2026
EGX_HOLIDAYS = [
    # 2025
    date(2025, 1, 7),   # Coptic Christmas
    date(2025, 1, 25),  # January 25 Revolution
    date(2025, 4, 25),  # Sinai Liberation Day
    date(2025, 5, 1),   # Labor Day
    date(2025, 6, 30),  # June 30 Revolution
    date(2025, 7, 23),  # July 23 Revolution
    date(2025, 10, 6),  # Armed Forces Day
    # Islamic holidays (approximate - based on lunar calendar 2025)
    date(2025, 3, 30),  # Eid Al Fitr Day 1
    date(2025, 3, 31),  # Eid Al Fitr Day 2
    date(2025, 4, 1),   # Eid Al Fitr Day 3
    date(2025, 6, 6),   # Arafat Day
    date(2025, 6, 7),   # Eid Al Adha Day 1
    date(2025, 6, 8),   # Eid Al Adha Day 2
    date(2025, 6, 9),   # Eid Al Adha Day 3
    date(2025, 6, 27),  # Islamic New Year
    date(2025, 9, 5),   # Prophet's Birthday
    # 2026
    date(2026, 1, 7),   # Coptic Christmas
    date(2026, 1, 25),  # January 25 Revolution
    date(2026, 4, 25),  # Sinai Liberation Day
    date(2026, 5, 1),   # Labor Day
    date(2026, 6, 30),  # June 30 Revolution
    date(2026, 7, 23),  # July 23 Revolution
    date(2026, 10, 6),  # Armed Forces Day
    # Islamic holidays (approximate - based on lunar calendar 2026)
    date(2026, 3, 20),  # Eid Al Fitr Day 1
    date(2026, 3, 21),  # Eid Al Fitr Day 2
    date(2026, 3, 22),  # Eid Al Fitr Day 3
    date(2026, 5, 27),  # Arafat Day
    date(2026, 5, 28),  # Eid Al Adha Day 1
    date(2026, 5, 29),  # Eid Al Adha Day 2
    date(2026, 5, 30),  # Eid Al Adha Day 3
    date(2026, 6, 17),  # Islamic New Year
    date(2026, 8, 25),  # Prophet's Birthday
]

# US Market (NYSE/NASDAQ) Official Holidays 2025-2026
US_HOLIDAYS = [
    # 2025
    date(2025, 1, 1),   # New Year's Day
    date(2025, 1, 20),  # Martin Luther King Jr. Day
    date(2025, 2, 17),  # Presidents Day
    date(2025, 4, 18),  # Good Friday
    date(2025, 5, 26),  # Memorial Day
    date(2025, 6, 19),  # Juneteenth
    date(2025, 7, 4),   # Independence Day
    date(2025, 9, 1),   # Labor Day
    date(2025, 11, 27), # Thanksgiving Day
    date(2025, 12, 25), # Christmas Day
    # 2026
    date(2026, 1, 1),   # New Year's Day
    date(2026, 1, 19),  # Martin Luther King Jr. Day
    date(2026, 2, 16),  # Presidents Day
    date(2026, 4, 3),   # Good Friday
    date(2026, 5, 25),  # Memorial Day
    date(2026, 6, 19),  # Juneteenth
    date(2026, 7, 3),   # Independence Day (observed)
    date(2026, 9, 7),   # Labor Day
    date(2026, 11, 26), # Thanksgiving Day
    date(2026, 12, 25), # Christmas Day
]

def is_egx_holiday(check_date: date) -> bool:
    """Returns True if the given date is an EGX holiday."""
    return check_date in EGX_HOLIDAYS

def is_us_holiday(check_date: date) -> bool:
    """Returns True if the given date is a US market holiday."""
    return check_date in US_HOLIDAYS

def is_egx_open(check_date: date) -> bool:
    """Returns True if EGX is open on the given date."""
    # EGX is open Monday-Friday, excluding holidays
    if check_date.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    return not is_egx_holiday(check_date)

def is_us_open(check_date: date) -> bool:
    """Returns True if US market is open on the given date."""
    # US is open Monday-Friday, excluding holidays
    if check_date.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    return not is_us_holiday(check_date)
