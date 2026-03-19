from pydantic import BaseModel
from typing import List, Optional, Tuple

class Point(BaseModel):
    x: float
    y: float

class Truck(BaseModel):
    id: str
    type: str # e.g., 'small', 'medium', 'large'
    payload_capacity: float
    turn_radius: float
    width: float
    length: float
    dump_radius: float # Estimated size of the pile it leaves
    position: Optional[Point] = None
    status: str = "IDLE" # IDLE, EN_ROUTE, DUMPING
    assigned_spot: Optional[Point] = None

class DumpZoneCreate(BaseModel):
    name: str
    polygon: List[Point] # Coordinates defining the boundary

class InitYardRequest(BaseModel):
    polygon: List[Point]
    entry_point: Point

class ZoneDefinition(BaseModel):
    id: int
    name: str
    polygon: List[Point]
    color: str

class RouteRequest(BaseModel):
    truck_id: str
    current_position: Point

class SpotAssignment(BaseModel):
    truck_id: str
    assigned_spot: Point
    route: List[Point]
    status: str
