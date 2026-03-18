import random
from part.models import Part, PartCategory
from stock.models import StockItem

entries = [
    ("AWP23", 5),
    ("AWP23-2", 7),
    ("AWP23-3", 13),
]

category, _ = PartCategory.objects.get_or_create(
    name="Wave Height Gauge",
    parent=None,
    defaults={"description": "Wave Height Gauge"},
)

def next_serial():
    while True:
        serial = f"S{random.randint(100, 999)}"
        if not StockItem.objects.filter(serial=serial).exists():
            return serial

for name, count in entries:
    part, _ = Part.objects.get_or_create(
        name=name,
        IPN="",
        revision="",
        defaults={
            "description": name,
            "category": category,
            "active": True,
            "purchaseable": True,
            "trackable": True,
        },
    )

    part.category = category
    part.trackable = True
    if not part.description:
        part.description = name
    part.save()

    StockItem.objects.filter(part=part).delete()

    for _ in range(count):
        StockItem.objects.create(
            part=part,
            quantity=1,
            location=None,
            serial=next_serial(),
        )

print("AWP stock recreated as serialized items")
