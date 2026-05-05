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

"""
Rig handler for satellite tracking.
Handles all rig-related operations including connection, frequency control, and doppler calculation.
"""

import logging
import time

from common.constants import DictKeys, SocketEvents, TrackingEvents
from controllers.rig import RigController
from controllers.sdr import SDRController
from tracking.doppler import calculate_doppler_shift

logger = logging.getLogger("tracker-worker")


class RigHandler:
    """Handles all rig-related operations for satellite tracking."""

    def __init__(self, tracker):
        """
        Initialize the rig handler.

        :param tracker: Reference to the parent SatelliteTracker instance
        """
        self.tracker = tracker
        self.last_vfo_update_time = 0.0  # Track when VFO frequencies were last updated

    async def connect_to_rig(self):
        """Connect to rig hardware (radio or SDR)."""
        if self.tracker.current_rig_id is not None and self.tracker.rig_controller is None:
            try:
                rig_details = self.tracker.rig_details
                rig_type = (self.tracker.input_hardware or {}).get("rig_type", "radio")

                if not rig_details:
                    raise Exception(
                        f"No rig details provided for ID: {self.tracker.current_rig_id}"
                    )

                # Create appropriate controller
                if rig_type == "sdr":
                    self.tracker.rig_controller = SDRController(sdr_details=rig_details)
                else:
                    self.tracker.rig_controller = RigController(
                        host=rig_details["host"], port=rig_details["port"]
                    )

                self.tracker.rig_details.update(
                    {
                        "host": self.tracker.rig_details["host"],
                        "port": self.tracker.rig_details.get("port"),
                    },
                )

                await self.tracker.rig_controller.connect()

                # Update state
                self.tracker.rig_data.update(
                    {
                        "connected": True,
                        "tracking": False,
                        "tuning": False,
                        "device_type": rig_details.get("type", "hardware"),
                        "host": self.tracker.rig_details.get("host", ""),
                        "port": self.tracker.rig_details.get("port", ""),
                    }
                )

                self.tracker.queue_out.put(
                    {
                        DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                        DictKeys.DATA: {
                            DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.RIG_CONNECTED}],
                            DictKeys.RIG_DATA: self.tracker.rig_data.copy(),
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Failed to connect to rig: {e}")
                logger.exception(e)
                await self.handle_rig_error(e)

    async def handle_rig_error(self, error):
        """Handle rig connection errors."""
        self.tracker.rig_data.update(
            {
                "connected": False,
                "tracking": False,
                "tuning": False,
                "error": True,
                "host": self.tracker.rig_data.get("host", ""),
                "port": self.tracker.rig_data.get("port", ""),
            }
        )

        updated_tracking_state = dict(self.tracker.input_tracking_state or {})
        updated_tracking_state["rig_state"] = "disconnected"
        self.tracker.input_tracking_state = updated_tracking_state

        self.tracker.queue_out.put(
            {
                DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                DictKeys.DATA: {
                    DictKeys.EVENTS: [
                        {DictKeys.NAME: TrackingEvents.RIG_ERROR, "error": str(error)}
                    ],
                    DictKeys.RIG_DATA: self.tracker.rig_data.copy(),
                    DictKeys.TRACKING_STATE: updated_tracking_state,
                },
            }
        )

        self.tracker.rig_controller = None

    async def handle_rig_state_change(self, old, new):
        """Handle rig state changes."""
        logger.info(f"Rig state change detected from '{old}' to '{new}'")

        if new == "connected":
            await self.connect_to_rig()
            self.tracker.rig_data["connected"] = True

        elif new == "disconnected":
            await self.disconnect_rig()
            self.tracker.rig_data["connected"] = False
            self.tracker.rig_data["tracking"] = False
            self.tracker.rig_data["stopped"] = True

        elif new == "tracking":
            await self.connect_to_rig()
            self.tracker.rig_data["tracking"] = True
            self.tracker.rig_data["stopped"] = False

        elif new == "stopped":
            self.tracker.rig_data["tracking"] = False
            self.tracker.rig_data["tuning"] = False
            self.tracker.rig_data["stopped"] = True

    async def disconnect_rig(self):
        """Disconnect from rig."""
        if self.tracker.rig_controller is not None:
            logger.info("Disconnecting from rig...")
            try:
                await self.tracker.rig_controller.disconnect()
                self.tracker.rig_data.update(
                    {"connected": False, "tracking": False, "tuning": False}
                )
                self.tracker.queue_out.put(
                    {
                        DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                        DictKeys.DATA: {
                            DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.RIG_DISCONNECTED}],
                            DictKeys.RIG_DATA: self.tracker.rig_data.copy(),
                        },
                    }
                )
            except Exception as e:
                logger.error(f"Error disconnecting from rig: {e}")
                logger.exception(e)
            finally:
                self.tracker.rig_controller = None

    async def handle_transmitter_tracking(self, satellite_tles, location):
        """Handle transmitter selection and doppler calculation for both RX and TX."""
        if self.tracker.current_transmitter_id != "none":
            current_transmitter = next(
                (
                    t
                    for t in self.tracker.input_transmitters
                    if t.get("id") == self.tracker.current_transmitter_id
                ),
                None,
            )

            if current_transmitter:
                downlink_freq = current_transmitter.get("downlink_low", 0)
                uplink_freq = current_transmitter.get("uplink_low", 0)

                self.tracker.rig_data["original_freq"] = downlink_freq
                self.tracker.rig_data["uplink_freq"] = uplink_freq

                # Calculate RX (downlink) doppler shift
                if downlink_freq and downlink_freq > 0:
                    (
                        self.tracker.rig_data["downlink_observed_freq"],
                        self.tracker.rig_data["doppler_shift"],
                    ) = calculate_doppler_shift(
                        satellite_tles[0],
                        satellite_tles[1],
                        location["lat"],
                        location["lon"],
                        0,
                        downlink_freq,
                    )
                else:
                    self.tracker.rig_data["downlink_observed_freq"] = 0
                    self.tracker.rig_data["doppler_shift"] = 0

                # Calculate TX (uplink) doppler shift (inverted)
                if uplink_freq and uplink_freq > 0:
                    uplink_observed, uplink_doppler = calculate_doppler_shift(
                        satellite_tles[0],
                        satellite_tles[1],
                        location["lat"],
                        location["lon"],
                        0,
                        uplink_freq,
                    )
                    # For TX, apply opposite correction
                    self.tracker.rig_data["uplink_observed_freq"] = (
                        2 * uplink_freq - uplink_observed
                    )
                    self.tracker.rig_data["uplink_doppler_shift"] = -uplink_doppler
                else:
                    self.tracker.rig_data["uplink_observed_freq"] = 0
                    self.tracker.rig_data["uplink_doppler_shift"] = 0

                if self.tracker.current_rig_state == "tracking":
                    self.tracker.rig_data["tracking"] = True
                    self.tracker.rig_data["stopped"] = False

                else:
                    self.tracker.rig_data["downlink_observed_freq"] = 0
                    self.tracker.rig_data["doppler_shift"] = 0
                    self.tracker.rig_data["uplink_observed_freq"] = 0
                    self.tracker.rig_data["uplink_doppler_shift"] = 0
                    self.tracker.rig_data["tracking"] = False
                    self.tracker.rig_data["stopped"] = True

            self.tracker.rig_data["transmitter_id"] = self.tracker.current_transmitter_id

        else:
            self.tracker.rig_data["transmitter_id"] = self.tracker.current_transmitter_id
            self.tracker.rig_data["downlink_observed_freq"] = 0
            self.tracker.rig_data["doppler_shift"] = 0
            self.tracker.rig_data["uplink_observed_freq"] = 0
            self.tracker.rig_data["uplink_doppler_shift"] = 0
            self.tracker.rig_data["uplink_freq"] = 0
            self.tracker.rig_data["tracking"] = False
            self.tracker.rig_data["stopped"] = True

    async def calculate_all_transmitters_doppler(self, satellite_tles, location):
        """Calculate doppler shift for all active transmitters of the current satellite.

        For RX (downlink): Applies positive doppler shift when satellite approaches.
        For TX (uplink): Applies negative doppler shift (opposite direction) so that
        the satellite receives the correct frequency after doppler effect.
        """
        if self.tracker.current_norad_id is None:
            self.tracker.rig_data["transmitters"] = []
            return

        try:
            transmitters_with_doppler = []
            for transmitter in self.tracker.input_transmitters:
                downlink_freq = transmitter.get("downlink_low", 0)
                uplink_freq = transmitter.get("uplink_low", 0)

                transmitter_data = {
                    "id": transmitter.get("id"),
                    "description": transmitter.get("description"),
                    "type": transmitter.get("type"),
                    "mode": transmitter.get("mode"),
                    "source": transmitter.get("source"),
                    "alive": transmitter.get("alive"),
                    "downlink_low": downlink_freq,
                    "downlink_high": transmitter.get("downlink_high"),
                    "uplink_low": uplink_freq,
                    "uplink_high": transmitter.get("uplink_high"),
                }

                # Calculate RX (downlink) doppler shift
                if downlink_freq and downlink_freq > 0:
                    downlink_observed_freq, doppler_shift = calculate_doppler_shift(
                        satellite_tles[0],
                        satellite_tles[1],
                        location["lat"],
                        location["lon"],
                        0,
                        downlink_freq,
                    )
                    transmitter_data["downlink_observed_freq"] = downlink_observed_freq
                    transmitter_data["doppler_shift"] = doppler_shift
                else:
                    transmitter_data["downlink_observed_freq"] = 0
                    transmitter_data["doppler_shift"] = 0

                # Calculate TX (uplink) doppler shift (inverted)
                if uplink_freq and uplink_freq > 0:
                    # Calculate the doppler shift for uplink
                    uplink_observed, uplink_doppler = calculate_doppler_shift(
                        satellite_tles[0],
                        satellite_tles[1],
                        location["lat"],
                        location["lon"],
                        0,
                        uplink_freq,
                    )
                    # For TX, we need to apply the opposite correction:
                    # If satellite is approaching (positive doppler), we transmit lower
                    # If satellite is receding (negative doppler), we transmit higher
                    transmitter_data["uplink_observed_freq"] = 2 * uplink_freq - uplink_observed
                    transmitter_data["uplink_doppler_shift"] = -uplink_doppler
                else:
                    transmitter_data["uplink_observed_freq"] = 0
                    transmitter_data["uplink_doppler_shift"] = 0

                # Only include transmitters that have at least downlink or uplink
                if downlink_freq > 0 or uplink_freq > 0:
                    transmitters_with_doppler.append(transmitter_data)

            self.tracker.rig_data["transmitters"] = transmitters_with_doppler
            # Debug log handled by tracker loop for compact output.

        except Exception as e:
            logger.error(f"Error calculating doppler for all transmitters: {e}")
            logger.exception(e)
            self.tracker.rig_data["transmitters"] = []

    async def control_rig_frequency(self):
        """Control rig frequency based on doppler calculations for both VFOs."""
        if self.tracker.rig_controller and self.tracker.current_rig_state == "tracking":
            # Check if this is an SDR or hardware rig
            if isinstance(self.tracker.rig_controller, SDRController):
                # SDR: Don't set center frequency - user controls that manually from UI
                # VFO frequency updates are handled in vfos/updates.py:handle_vfo_updates_for_tracking()
                logger.debug(
                    f"SDR tracking - doppler freq: {self.tracker.rig_data['downlink_observed_freq']:.0f} Hz (VFO updates handled separately)"
                )

            else:
                # Hardware rig: Set both VFO 1 and VFO 2 frequencies
                # Only update every 5 seconds to minimize VFO switching
                current_time = time.time()
                if current_time - self.last_vfo_update_time < 5.0:
                    return

                self.last_vfo_update_time = current_time

                # Find the selected transmitter to get frequencies
                transmitter = None
                if self.tracker.current_transmitter_id != "none":
                    for t in self.tracker.rig_data.get("transmitters", []):
                        if t["id"] == self.tracker.current_transmitter_id:
                            transmitter = t
                            break

                if transmitter:
                    # Determine frequencies for VFO 1 and VFO 2
                    vfo1_freq = None
                    vfo2_freq = None
                    downlink_vfo = None  # Track which VFO has downlink

                    if self.tracker.current_vfo1 == "uplink":
                        vfo1_freq = transmitter.get("uplink_observed_freq", 0)
                    elif self.tracker.current_vfo1 == "downlink":
                        vfo1_freq = transmitter.get("downlink_observed_freq", 0)
                        downlink_vfo = "1"

                    if self.tracker.current_vfo2 == "uplink":
                        vfo2_freq = transmitter.get("uplink_observed_freq", 0)
                    elif self.tracker.current_vfo2 == "downlink":
                        vfo2_freq = transmitter.get("downlink_observed_freq", 0)
                        downlink_vfo = "2"

                    # Set VFO 1 frequency if configured
                    if vfo1_freq and vfo1_freq > 0:
                        try:
                            frequency_gen = self.tracker.rig_controller.set_frequency(
                                vfo1_freq, vfo="1"
                            )
                            current_frequency, is_tuning = await anext(frequency_gen)

                            # Update VFO 1 data with the frequency we're setting
                            self.tracker.rig_data["vfo1"] = {
                                "frequency": vfo1_freq,
                                "mode": transmitter.get("mode", "UNKNOWN"),
                                "bandwidth": 0,
                            }

                            logger.debug(
                                f"Hardware rig VFO 1 ({self.tracker.current_vfo1}): {current_frequency} Hz, tuning={is_tuning}"
                            )
                        except StopAsyncIteration:
                            logger.info(
                                f"Hardware rig VFO 1 tuned to {vfo1_freq} Hz ({self.tracker.current_vfo1})"
                            )
                        except Exception as e:
                            logger.error(f"Error setting VFO 1 frequency: {e}")

                    # Set VFO 2 frequency if configured
                    if vfo2_freq and vfo2_freq > 0:
                        try:
                            frequency_gen = self.tracker.rig_controller.set_frequency(
                                vfo2_freq, vfo="2"
                            )
                            current_frequency, is_tuning = await anext(frequency_gen)

                            # Update VFO 2 data with the frequency we're setting
                            self.tracker.rig_data["vfo2"] = {
                                "frequency": vfo2_freq,
                                "mode": transmitter.get("mode", "UNKNOWN"),
                                "bandwidth": 0,
                            }

                            logger.debug(
                                f"Hardware rig VFO 2 ({self.tracker.current_vfo2}): {current_frequency} Hz, tuning={is_tuning}"
                            )
                        except StopAsyncIteration:
                            logger.info(
                                f"Hardware rig VFO 2 tuned to {vfo2_freq} Hz ({self.tracker.current_vfo2})"
                            )
                        except Exception as e:
                            logger.error(f"Error setting VFO 2 frequency: {e}")

                    # After setting both VFOs, select the downlink VFO to help the user with QSOs
                    if downlink_vfo:
                        try:
                            vfo_name = "VFOA" if downlink_vfo == "1" else "VFOB"
                            await self.tracker.rig_controller.set_vfo(vfo_name)
                            logger.debug(f"Selected {vfo_name} (downlink) for user operation")
                        except Exception as e:
                            logger.error(f"Error selecting downlink VFO: {e}")

    async def update_hardware_frequency(self):
        """Update current rig frequency (no VFO reading to avoid switching)."""
        if self.tracker.rig_controller:
            # Get main frequency (current VFO)
            self.tracker.rig_data["frequency"] = await self.tracker.rig_controller.get_frequency()

            # Don't read VFO data from rig to avoid VFO switching
            # VFO data is populated by control_rig_frequency() when setting frequencies
