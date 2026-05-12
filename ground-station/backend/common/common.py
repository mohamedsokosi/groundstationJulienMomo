# Copyright (c) 2025 Efstratios Goudelis
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.


import functools
import json
import math
import time
import uuid
from datetime import date, datetime, timedelta

import numpy

from .logger import logger


class ModelEncoder(json.JSONEncoder):
    def __init__(self, *args, **kwargs):
        # Force allow_nan=False to raise errors instead of producing invalid JSON
        # We'll handle NaN/Infinity by converting to None in default()
        kwargs["allow_nan"] = False
        super().__init__(*args, **kwargs)

    def default(self, obj):

        if isinstance(obj, (date, datetime)):
            return obj.isoformat()

        if isinstance(obj, timedelta):
            return str(obj)

        if isinstance(obj, uuid.UUID):
            return str(obj)

        if isinstance(obj, bool):
            return bool(obj)

        # Handle numpy types
        if isinstance(obj, numpy.bool_):
            return bool(obj)

        if isinstance(obj, (numpy.integer, numpy.int_)):
            return int(obj)

        if isinstance(obj, (numpy.floating, numpy.float64)):
            value = float(obj)
            # Sanitize NaN and Infinity values to null for valid JSON
            # JavaScript's JSON.parse() cannot handle unquoted NaN/Infinity
            if not math.isfinite(value):
                return None
            return value

        # Attempt to convert SQLAlchemy model objects
        # by reading their columns
        try:
            return {column.name: getattr(obj, column.name) for column in obj.__table__.columns}
        except AttributeError:
            # If the object is not an SQLAlchemy model row, fallback
            return super().default(obj)

    def encode(self, o):
        # Sanitize the data structure before encoding to catch regular Python floats
        def sanitize(obj):
            if isinstance(obj, float):
                if not math.isfinite(obj):
                    return None
                return obj
            elif isinstance(obj, dict):
                return {k: sanitize(v) for k, v in obj.items()}
            elif isinstance(obj, (list, tuple)):
                return [sanitize(item) for item in obj]
            return obj

        sanitized = sanitize(o)
        return super().encode(sanitized)


def serialize_object(obj):
    """
    Serializes a Python object into a JSON-compatible format and then
    deserializes it back to a Python object. The serialization utilizes
    a custom JSON encoder, `ModelEncoder`, to handle potentially
    non-standard object types. The function ensures that the resulting
    object is JSON-compatible but has been reconstructed into its
    Python representation.

    :param obj: The Python object to be serialized and deserialized.
        This may include custom objects that require a specific
        JSON encoder, as well as built-in Python data structures.
    :return: The deserialized Python object resulting from the
        serialization and deserialization process. The output is a
        JSON-compatible Python object reconstructed to mimic the
        original input structure.
    """
    return json.loads(json.dumps(obj, cls=ModelEncoder))


def timeit(func):
    """Decorator that reports the execution time of the decorated function."""

    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        elapsed_time = end_time - start_time
        logger.info(f"Function '{func.__name__}' executed in {elapsed_time:.6f} seconds.")
        return result

    return wrapper


def async_timeit(func):
    """
    Async decorator that reports the execution time of the decorated coroutine.
    """

    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = await func(*args, **kwargs)
        end_time = time.perf_counter()
        elapsed_time = end_time - start_time
        logger.info(f"Function '{func.__name__}' executed in {elapsed_time:.6f} seconds.")
        return result

    return wrapper


