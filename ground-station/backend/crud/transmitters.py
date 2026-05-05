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

import traceback
import uuid
from datetime import datetime, timezone
from typing import Union

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common.common import logger, serialize_object
from db.models import Transmitters


async def fetch_transmitters_for_satellite(session: AsyncSession, norad_id: int) -> dict:
    """
    Fetch all transmitter records associated with the given satellite NORAD id.
    Matches by either norad_cat_id or norad_follow_id.
    """
    try:
        stmt = select(Transmitters).filter(
            (Transmitters.norad_cat_id == norad_id) | (Transmitters.norad_follow_id == norad_id)
        )
        result = await session.execute(stmt)
        transmitters = result.scalars().all()
        transmitters = serialize_object(transmitters)
        return {"success": True, "data": transmitters, "error": None}

    except Exception as e:
        logger.error(f"Error fetching transmitters for satellite {norad_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_transmitter(session: AsyncSession, transmitter_id: Union[uuid.UUID, str]) -> dict:
    """
    Fetch a single transmitter record by its UUID or string representation.
    """
    try:
        # Since transmitter.id is a string, convert UUID to string if needed
        if isinstance(transmitter_id, uuid.UUID):
            transmitter_id = str(transmitter_id)

        stmt = select(Transmitters).filter(Transmitters.id == transmitter_id)
        result = await session.execute(stmt)
        transmitter = result.scalar_one_or_none()
        transmitter = serialize_object(transmitter)
        return {"success": True, "data": transmitter, "error": None}

    except Exception as e:
        logger.error(f"Error fetching transmitters by transmitter id {transmitter_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_transmitter(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new transmitter record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        data["id"] = str(new_id)
        data["added"] = now
        data["updated"] = now

        # rename some fields
        data["norad_cat_id"] = data.pop("satelliteId")

        uplink_low_val = data.pop("uplinkLow")
        data["uplink_low"] = None if uplink_low_val == "-" else uplink_low_val

        uplink_high_val = data.pop("uplinkHigh")
        data["uplink_high"] = None if uplink_high_val == "-" else uplink_high_val

        downlink_low_val = data.pop("downlinkLow")
        data["downlink_low"] = None if downlink_low_val == "-" else downlink_low_val

        downlink_high_val = data.pop("downlinkHigh")
        data["downlink_high"] = None if downlink_high_val == "-" else downlink_high_val

        uplink_drift_val = data.pop("uplinkDrift")
        data["uplink_drift"] = None if uplink_drift_val == "-" else uplink_drift_val

        downlink_drift_val = data.pop("downlinkDrift")
        data["downlink_drift"] = None if downlink_drift_val == "-" else downlink_drift_val

        data["uplink_mode"] = data.pop("uplinkMode")

        if not data.get("source"):
            data["source"] = "manual"

        stmt = insert(Transmitters).values(**data).returning(Transmitters)

        result = await session.execute(stmt)
        await session.commit()
        new_transmitter = result.scalar_one()
        new_transmitter = serialize_object(new_transmitter)
        return {"success": True, "data": new_transmitter, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_transmitter(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing transmitter record by updating provided fields.
    """
    try:
        transmitter_id = data.pop("id")

        data.pop("added", None)
        data.pop("updated", None)

        # rename some fields
        data["norad_cat_id"] = data.pop("satelliteId")

        uplink_low_val = data.pop("uplinkLow")
        data["uplink_low"] = None if uplink_low_val == "-" else uplink_low_val

        uplink_high_val = data.pop("uplinkHigh")
        data["uplink_high"] = None if uplink_high_val == "-" else uplink_high_val

        downlink_low_val = data.pop("downlinkLow")
        data["downlink_low"] = None if downlink_low_val == "-" else downlink_low_val

        downlink_high_val = data.pop("downlinkHigh")
        data["downlink_high"] = None if downlink_high_val == "-" else downlink_high_val

        uplink_drift_val = data.pop("uplinkDrift")
        data["uplink_drift"] = None if uplink_drift_val == "-" else uplink_drift_val

        downlink_drift_val = data.pop("downlinkDrift")
        data["downlink_drift"] = None if downlink_drift_val == "-" else downlink_drift_val

        data["uplink_mode"] = data.pop("uplinkMode")

        # Ensure the record exists first
        stmt = select(Transmitters).filter(Transmitters.id == transmitter_id)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if not existing:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}

        # Add updated timestamp
        data["updated"] = datetime.now(timezone.utc)

        upd_stmt = (
            update(Transmitters)
            .where(Transmitters.id == transmitter_id)
            .values(**data)
            .returning(Transmitters)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_transmitter = upd_result.scalar_one_or_none()
        updated_transmitter = serialize_object(updated_transmitter)
        return {"success": True, "data": updated_transmitter, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_transmitter(session: AsyncSession, transmitter_id: Union[uuid.UUID, str]) -> dict:
    """
    Delete a transmitter record by its UUID or string representation of UUID.
    """
    try:
        logger.info(transmitter_id)

        del_stmt = (
            delete(Transmitters).where(Transmitters.id == transmitter_id).returning(Transmitters)
        )
        result = await session.execute(del_stmt)
        deleted = result.scalar_one_or_none()
        if not deleted:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
