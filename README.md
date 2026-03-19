# Autonomous Dump Planning System (ADPS)
Caterpillar 2026 Tech Challenge - Optimal Dump Packing Simulation

An interactive full-stack web application designed to simulate, visualize, and optimize an autonomous fleet of trucks dumping payloads into dynamically drawn polygon yards.

## Features

- **Interactive Yard Drawing**: Use a precise cursor mapping tool on an HTML5 canvas to point-and-click geometric polygon bounds that define the bounds of the dump yard.
- **Dynamic Entry Points**: Move the entry gate pin dynamically at runtime to completely recalculate the algorithm's axis of attack.
- **Perfect Matrix Filling**: The backend leverages Shapely geometry to map exact continuous-space constraints to the frontend's target grid matrix. Trucks drop payloads layer-by-layer across the yard, maintaining exact boundaries and filling gaps securely.
- **Collision pathfinding**: Real-time A* pathfinding ensures that trucks dynamically route around fresh obstacles, piles, and boundaries to avoid intersecting on return trips. 
- **Real-Time Canvas Metrics**: Live dashboards plotting fleet density, operations, heatmap visuals, and truck activity statuses.

## Tech Stack

**Frontend:**
- React 18, TypeScript, Vite
- HTML5 Canvas 2D API for 60fps lightweight simulation drawing
- Tailwind CSS
- Zustand (State Management)
- Lucide React (Icons)

**Backend:**
- Python 3
- FastAPI & Uvicorn (ASGI interface)
- Shapely (Complex geometric Polygon mapping, Point-in-Polygon validation)
- Pydantic (Strong type validation)
- Custom A* pathfinding & Heuristic solvers 

## Running Locally

To run the project locally, you must run both the Frontend and the Backend servers simultaneously.

### 1. Setup Backend

The backend utilizes FastAPI to crunch and manage coordinates and pathfinding geometries.

```bash
cd backend

# Create a python virtual environment
python3 -m venv venv

# Activate standard environment (MacOS/Linux):
source venv/bin/activate
# Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Run the API server locally
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Setup Frontend

The frontend is built using Vite and displays the autonomous fleet.

```bash
cd frontend

# Install dependencies (requires Node.js)
npm install

# Start the active development server
npm run dev
```

Navigate to `http://localhost:8080/` in your browser. (Check your terminal output for the exact URL port if 8080 is occupied).

## Usage Guide
1. On load, click **Draw Yard** in the top navigation bar.
2. Click points along the canvas to draw a closed structural polygon. 
3. Click **Finish Polygon**.
4. Click anywhere inside the polygon to drop your **Entry Point** pin. 
5. Click **Start** to initialize continuous backend dispatch routing. 
6. Watch as the backend routes trucks mathematically to the furthest bounds and layer-sweeps across your matrix toward the entry point. You may pause and click **Move Entry Point** to change the geometric center of gravity on the fly!
