from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import Truck, DumpZoneCreate, RouteRequest, SpotAssignment, InitYardRequest, ZoneDefinition, Point
from .dump_manager import DumpManager

app = FastAPI(title="Caterpillar 2026 Tech Challenge - Optimal Dump Packing API")

# Configure CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = DumpManager()

@app.post("/api/init_yard")
def init_yard(req: InitYardRequest):
    """Initializes the whole yard with a dynamic polygon and entry point."""
    manager.reset()
    zones = manager.init_yard(req.polygon, req.entry_point)
    # Return zone definitions back
    return {"zones": zones, "message": "Yard initialized with sub-polygons."}

@app.post("/api/zones", status_code=201)
def create_dump_zone(zone: DumpZoneCreate):
    """Initializes a new dump zone with polygon bounds."""
    manager.add_zone(zone.name, zone.polygon)
    return {"message": "Dump zone created successfully"}
    
@app.post("/api/trucks", status_code=201)
def register_truck(truck: Truck):
    """Registers a truck with its configuration."""
    manager.register_truck(truck)
    return {"message": f"Truck {truck.id} registered successfully"}
    
@app.post("/api/assign_dump", response_model=SpotAssignment)
def assign_dump_spot(req: RouteRequest, zone_name: str):
    """Requests a spot and a route for a truck to drop its payload."""
    if req.truck_id not in manager.trucks:
        raise HTTPException(status_code=404, detail="Truck not found")
        
    truck = manager.trucks[req.truck_id]
    truck.position = req.current_position
    
    result = manager.assign_truck_to_zone(truck.id, zone_name)
    if not result:
        raise HTTPException(status_code=400, detail="Cannot assign spot - Zone is full or Invalid Request")
        
    spot, route = result
    return SpotAssignment(
        truck_id=truck.id,
        assigned_spot=spot,
        route=route,
        status="EN_ROUTE"
    )

@app.post("/api/complete_dump")
def complete_dump(truck_id: str, zone_name: str):
    """Notifies that a truck has dumped the payload, updating the central controller."""
    if truck_id not in manager.trucks or zone_name not in manager.zones:
        raise HTTPException(status_code=404, detail="Invalid truck or zone")
        
    manager.mark_dump_complete(truck_id, zone_name)
    return {"message": f"Dump completed for truck {truck_id}. Zone updated."}

@app.post("/api/return_route", response_model=list[Point])
def get_return_route_api(req: RouteRequest, zone_name: str, entry_x: float, entry_y: float):
    if req.truck_id not in manager.trucks:
        raise HTTPException(status_code=404, detail="Truck not found")
        
    truck = manager.trucks[req.truck_id]
    truck.position = req.current_position
    ep = Point(x=entry_x, y=entry_y)
    route = manager.get_return_route(truck.id, zone_name, ep)
    if route is None:
        return [ep]
    return route

@app.get("/api/status")
def get_system_status():
    """Returns the current state of all trucks and zones."""
    return {
        "trucks": {k: v.dict() for k, v in manager.trucks.items()},
        "zones": {k: {"piles_count": len(v.piles), "piles": [{"x": p.x, "y": p.y} for p in v.piles]} for k, v in manager.zones.items()}
    }
