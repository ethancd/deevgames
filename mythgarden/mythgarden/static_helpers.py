import uuid


def guard_types(lst, cls):
    """Returns True if all objects in lst are instances of cls, else raises a TypeError"""
    try:
        iter(lst)
    except TypeError:
        raise TypeError(f"{lst} is not iterable")

    for obj in lst:
        guard_type(obj, cls)
    return True


def guard_type(obj, cls):
    """Returns True if obj is an instance of cls, else raises a TypeError"""
    if isinstance(obj, cls):
        return True
    else:
        raise TypeError(f"{obj} is not a valid {cls} object")


def generate_uuid():
    return uuid.uuid4().hex
