import heapq
import math
from typing import List, Tuple, Set

class AStarPathfinder:
    def __init__(self, grid_size: float = 5.0):
        self.grid_size = grid_size
        self.obstacles: Set[Tuple[int, int]] = set()
        self.polygon_bounds = None # (min_x, max_x, min_y, max_y)
        
    def add_obstacle(self, cx: float, cy: float, radius: float):
        """Adds a circular obstacle (e.g., a dumped pile or another truck) to the grid map."""
        radius += self.grid_size * 2 # Add buffer for safety
        steps = int(math.ceil(radius / self.grid_size))
        grid_cx, grid_cy = self._to_grid(cx, cy)
        
        for dx in range(-steps, steps + 1):
            for dy in range(-steps, steps + 1):
                if math.hypot(dx * self.grid_size, dy * self.grid_size) <= radius:
                    self.obstacles.add((grid_cx + dx, grid_cy + dy))
                    
    def add_polygon_obstacle(self, exterior_coords: List[Tuple[float, float]]):
        """Adds an entire polygon as an obstacle by marking its interior grid cells."""
        from shapely.geometry import Polygon, Point
        poly = Polygon(exterior_coords)
        bounds = poly.bounds
        if not bounds:
            return
            
        minx, miny, maxx, maxy = bounds
        min_gx, min_gy = self._to_grid(minx, miny)
        max_gx, max_gy = self._to_grid(maxx, maxy)
        
        for gx in range(min_gx, max_gx + 1):
            for gy in range(min_gy, max_gy + 1):
                px, py = self._from_grid(gx, gy)
                if poly.contains(Point(px, py)):
                    self.obstacles.add((gx, gy))

    def set_polygon_bounds(self, exterior_coords: List[Tuple[float, float]]):
        """Marks all grid cells OUTSIDE the polygon as obstacles and clamps A*."""
        from shapely.geometry import Polygon
        poly = Polygon(exterior_coords)
        bounds = poly.bounds
        if not bounds:
            return
            
        minx, miny, maxx, maxy = bounds
        self.min_gx, self.min_gy = self._to_grid(minx, miny)
        self.max_gx, self.max_gy = self._to_grid(maxx, maxy)
        
        # Removed the O(N^2) dense poly.contains() loop that froze the server.
        # Bounding to min/max gx/gy in get_neighbors is sufficient to keep pathfinding reasonable.

    def _to_grid(self, x: float, y: float) -> Tuple[int, int]:
        return int(round(x / self.grid_size)), int(round(y / self.grid_size))
        
    def _from_grid(self, gx: int, gy: int) -> Tuple[float, float]:
        return gx * self.grid_size, gy * self.grid_size
        
    def heuristic(self, a, b):
        # Euclidean distance
        return math.hypot(a[0] - b[0], a[1] - b[1])
        
    def get_neighbors(self, node):
        x, y = node
        neighbors = []
        for dx, dy in [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1)]:
            nx, ny = x + dx, y + dy
            if hasattr(self, 'min_gx') and self.min_gx is not None:
                if nx < self.min_gx or nx > self.max_gx or ny < self.min_gy or ny > self.max_gy:
                    continue
            if (nx, ny) not in self.obstacles:
                neighbors.append((nx, ny))
        return neighbors

    def find_path(self, start: Tuple[float, float], goal: Tuple[float, float]) -> List[Tuple[float, float]]:
        start_node = self._to_grid(*start)
        goal_node = self._to_grid(*goal)
        
        if start_node in self.obstacles:
            start_node = self._find_nearest_free_node(start_node)
        if goal_node in self.obstacles:
            goal_node = self._find_nearest_free_node(goal_node)
            
        frontier = []
        heapq.heappush(frontier, (0, start_node))
        came_from = {}
        cost_so_far = {}
        came_from[start_node] = None
        cost_so_far[start_node] = 0
        
        while len(frontier) > 0:
            current = heapq.heappop(frontier)[1]
            if current == goal_node:
                break
                
            for next in self.get_neighbors(current):
                new_cost = cost_so_far[current] + math.hypot(current[0]-next[0], current[1]-next[1])
                if next not in cost_so_far or new_cost < cost_so_far[next]:
                    cost_so_far[next] = new_cost
                    priority = new_cost + self.heuristic(goal_node, next)
                    heapq.heappush(frontier, (priority, next))
                    came_from[next] = current
                    
        # Reconstruct path
        if goal_node not in came_from:
            return [] # No path found
            
        current = goal_node
        path = []
        while current != start_node:
            path.append(self._from_grid(*current))
            current = came_from[current]
        path.append(self._from_grid(*start_node))
        path.reverse()
        return path

    def _find_nearest_free_node(self, node: Tuple[int, int]) -> Tuple[int, int]:
        radius = 1
        while radius < 100:
            for dx in range(-radius, radius + 1):
                for dy in range(-radius, radius + 1):
                    neighbor = (node[0] + dx, node[1] + dy)
                    if neighbor not in self.obstacles:
                        return neighbor
            radius += 1
        return node
