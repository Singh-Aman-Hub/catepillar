from typing import List, Optional, Tuple, Dict
from shapely.geometry import Point, Polygon
from .models import Point as PydanticPoint, Truck
from .pathfinder import AStarPathfinder
import math

class DumpZone:
    def __init__(self, name: str, polygon_coords: List[PydanticPoint], entry_point: PydanticPoint = None):
        self.name = name
        self.polygon = Polygon([(p.x, p.y) for p in polygon_coords])
        self.piles: List[Point] = []
        # Store radii of placed piles
        self.pile_radii: List[float] = []
        self.entry_point = Point(entry_point.x, entry_point.y) if entry_point else None

    def get_available_spots(self, dump_radius: float, clearance: float) -> Optional[Tuple[float, float]]:
        # This is a simplified dynamic spot packing strategy.
        # It tries to find a position deep inside the polygon that is safe (no overlaps).
        # We shrink the polygon by dump_radius + clearance to ensure the truck fits completely.
        safe_area = self.polygon.buffer(-(dump_radius + clearance))
        
        if safe_area.is_empty:
            return None # Polygon is full or too small
            
        # We need to pick a spot inside safe_area that doesn't overlap existing piles
        # We evaluate a grid of points over the bounding box of safe_area
        bounds = safe_area.bounds
        if not bounds: return None
        minx, miny, maxx, maxy = bounds
        
        step = max(1.0, float(dump_radius))
        candidates = []
        
        x = minx
        while x <= maxx:
            y = miny
            while y <= maxy:
                p = Point(x, y)
                if safe_area.contains(p):
                    # Check overlap with existing piles
                    overlap = False
                    for existing_pile, r in zip(self.piles, self.pile_radii):
                        if p.distance(existing_pile) < (dump_radius + r + clearance):
                            overlap = True
                            break
                    if not overlap:
                        candidates.append((x, y))
                y += step
            x += step
            
        if not candidates:
            return None
            
        ep = self.entry_point if self.entry_point else Point(minx, miny)
        centroid = safe_area.centroid
        
        # Calculate main vector away from the entry point
        vec_x = centroid.x - ep.x
        vec_y = centroid.y - ep.y
        length = math.hypot(vec_x, vec_y)
        if length == 0:
            vec_x, vec_y = 1, 0
            length = 1
        dir_x, dir_y = vec_x / length, vec_y / length
        ortho_x, ortho_y = -dir_y, dir_x
        
        def score(pt):
            # Distance along the main axis radiating AWAY from the entry point
            px = pt[0] - ep.x
            py = pt[1] - ep.y
            depth = px * dir_x + py * dir_y
            
            # Snap to a strict layer to force sweeping lines
            layer_thickness = float(dump_radius) * 1.5
            layer_idx = round(depth / layer_thickness)
            
            # Distance along orthogonal line forming the sweep
            sweep = px * ortho_x + py * ortho_y
            
            # We want the HIGHEST layer (furthest away), and then sequentially lower sweep value (left-to-right)
            return (layer_idx, -sweep)

        best_point = max(candidates, key=score)
        self.piles.append(Point(*best_point))
        self.pile_radii.append(dump_radius)
        return best_point

class DumpManager:
    def __init__(self):
        self.zones: Dict[str, DumpZone] = {}
        self.trucks: Dict[str, Truck] = {}
        self.global_pathfinder = AStarPathfinder(grid_size=5.0)
        self.yard_polygon = None
        self.entry_point = None
        self.global_pile_counts: Dict[Tuple[float, float], int] = {}

    def reset(self):
        self.zones.clear()
        self.trucks.clear()
        self.global_pathfinder = AStarPathfinder(grid_size=5.0)
        self.yard_polygon = None
        self.entry_point = None
        self.global_pile_counts.clear()

    def init_yard(self, polygon_coords: List[PydanticPoint], entry_point: PydanticPoint) -> List[dict]:
        main_poly = Polygon([(p.x, p.y) for p in polygon_coords])
        bounds = main_poly.bounds
        if not bounds:
            return []
            
        self.yard_polygon = main_poly
        self.entry_point = Point(entry_point.x, entry_point.y)
        self.global_pathfinder.set_polygon_bounds([(p.x, p.y) for p in polygon_coords])
            
        minx, miny, maxx, maxy = bounds
        grid_rows, grid_cols = 3, 3
        cell_w = (maxx - minx) / grid_cols
        cell_h = (maxy - miny) / grid_rows
        
        raw_zones = []
        
        for r in range(grid_rows):
            for c in range(grid_cols):
                cx1 = minx + c * cell_w
                cy1 = miny + r * cell_h
                cx2 = cx1 + cell_w
                cy2 = cy1 + cell_h
                
                cell_poly = Polygon([
                    (cx1, cy1), (cx2, cy1), (cx2, cy2), (cx1, cy2)
                ])
                
                intersection = main_poly.intersection(cell_poly)
                if not intersection.is_empty and intersection.area > 50:
                    raw_zones.append(intersection)
                    
        # Sort raw_zones by distance to entry_point (furthest first)
        ep = self.entry_point
        raw_zones.sort(key=lambda z: z.centroid.distance(ep), reverse=True)
        
        zones_out = []
        colors = [
            'hsla(48, 96%, 53%, 0.15)', 'hsla(160, 84%, 39%, 0.15)', 'hsla(199, 89%, 48%, 0.15)', 
            'hsla(280, 67%, 55%, 0.15)', 'hsla(20, 90%, 50%, 0.15)', 'hsla(340, 80%, 50%, 0.15)'
        ]
        
        for i, poly in enumerate(raw_zones):
            name = f"zone_{i}"
            if poly.geom_type == 'Polygon':
                coords = list(poly.exterior.coords)
            elif poly.geom_type == 'MultiPolygon':
                largest = max(poly.geoms, key=lambda p: p.area)
                coords = list(largest.exterior.coords)
            else:
                continue
                
            p_coords = [PydanticPoint(x=c[0], y=c[1]) for c in coords]
            self.zones[name] = DumpZone(name, p_coords, entry_point) # Keep for frontend compatibility
            
            zones_out.append({
                "id": i,
                "name": name,
                "polygon": [{"x": c[0], "y": c[1]} for c in coords],
                "color": colors[i % len(colors)]
            })
            
        return zones_out
        
    def register_truck(self, truck: Truck):
        self.trucks[truck.id] = truck
        
    def _get_global_spot(self, dump_radius: float, clearance: float) -> Optional[Tuple[float, float]]:
        if not self.yard_polygon or not self.entry_point:
            return None
            
        grid_rows, grid_cols = 20, 30
        yard_padding = 40
        yard_width = 720
        yard_height = 480
        cell_w = (yard_width - 2 * yard_padding) / grid_cols
        cell_h = (yard_height - 2 * yard_padding) / grid_rows
        
        candidates = []
        
        # Determine furthest point to anchor the sweeping direction
        furthest_pt = max(self.yard_polygon.exterior.coords, key=lambda c: math.hypot(c[0]-self.entry_point.x, c[1]-self.entry_point.y))
        
        for r in range(grid_rows):
            for c in range(grid_cols):
                cx = yard_padding + c * cell_w + cell_w / 2
                cy = yard_padding + r * cell_h + cell_h / 2
                p = Point(cx, cy)
                
                if self.yard_polygon.contains(p):
                    count = self.global_pile_counts.get((cx, cy), 0)
                    if count < 3:
                        candidates.append((cx, cy))
            
        if not candidates:
            return None
            
        vec_x = furthest_pt[0] - self.entry_point.x
        vec_y = furthest_pt[1] - self.entry_point.y
        length = math.hypot(vec_x, vec_y)
        if length == 0:
            vec_x, vec_y = 1, 0
            length = 1
        dir_x, dir_y = vec_x / length, vec_y / length
        ortho_x, ortho_y = -dir_y, dir_x
        
        def score(pt):
            px = pt[0] - self.entry_point.x
            py = pt[1] - self.entry_point.y
            depth = px * dir_x + py * dir_y
            
            layer_thickness = cell_w * 1.5
            layer_idx = round(depth / layer_thickness)
            sweep = px * ortho_x + py * ortho_y
            
            count = self.global_pile_counts.get(pt, 0)
            
            return (layer_idx, -sweep, count)

        best_point = max(candidates, key=score)
        self.global_pile_counts[best_point] = self.global_pile_counts.get(best_point, 0) + 1
        return best_point

    def assign_truck_to_zone(self, truck_id: str, zone_name: str) -> Optional[Tuple[PydanticPoint, List[PydanticPoint]]]:
        if truck_id not in self.trucks:
            return None
            
        truck = self.trucks[truck_id]
        pf = self.global_pathfinder
        
        # Ignore zone_name, pick spot completely globally across the yard polygon
        spot = self._get_global_spot(truck.dump_radius, clearance=truck.turn_radius)
        if not spot:
            return None
            
        spot_pydantic = PydanticPoint(x=spot[0], y=spot[1])
        truck.assigned_spot = spot_pydantic
        truck.status = "EN_ROUTE"
        
        route_points = []
        if truck.position:
            path = pf.find_path(
                (truck.position.x, truck.position.y),
                (spot[0], spot[1])
            )
            route_points = [PydanticPoint(x=p[0], y=p[1]) for p in path]
            
        return spot_pydantic, route_points
        
    def get_return_route(self, truck_id: str, zone_name: str, entry_point: PydanticPoint) -> Optional[List[PydanticPoint]]:
        if truck_id not in self.trucks:
            return None
            
        truck = self.trucks[truck_id]
        pf = self.global_pathfinder
        
        route_points = []
        if truck.position:
            path = pf.find_path(
                (truck.position.x, truck.position.y),
                (entry_point.x, entry_point.y)
            )
            route_points = [PydanticPoint(x=p[0], y=p[1]) for p in path]
            
        return route_points
        
    def mark_dump_complete(self, truck_id: str, zone_name: str):
        if truck_id in self.trucks:
            truck = self.trucks[truck_id]
            if truck.assigned_spot:
                spot = (truck.assigned_spot.x, truck.assigned_spot.y)
                # Adding obstacle for the newly dumped pile so subsequent paths route around it.
                # Only block if it is fully loaded (3 trucks assigned to it)
                if self.global_pile_counts.get(spot, 0) >= 3:
                    self.global_pathfinder.add_obstacle(spot[0], spot[1], truck.dump_radius)
            truck.status = "IDLE"
            truck.assigned_spot = None
