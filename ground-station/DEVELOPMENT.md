# Development

This guide covers development setup, build steps, and tooling.

## Prerequisites

*   Python 3.8+
*   Node.js 14+
*   Docker (optional)

## Installation

### Option 1: Using pyproject.toml (Recommended)

The backend now uses modern Python packaging with `pyproject.toml`, which provides better dependency management and development tooling.

1.  **Backend Setup**
    ```bash
    cd backend
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate

    # Install the project in editable mode with all dependencies
    pip install -e .

    # For development (includes testing and code quality tools)
    pip install -e ".[dev]"

    # Start the server
    python app.py --host 0.0.0.0 --port 5000
    ```

2.  **Frontend Setup**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    The development server proxies API and socket traffic to the backend port defined in `.env.development` (defaults to `localhost:5000`).

### Option 2: Using requirements.txt (Traditional)

1.  **Backend**
    ```bash
    cd backend
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt

    # For development
    pip install -r requirements-dev.txt

    python app.py --host 0.0.0.0 --port 5000
    ```

2.  **Frontend**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

## LoRa Decoder Support (GNU Radio + gr-lora_sdr)

The ground station includes a LoRa decoder that uses GNU Radio and gr-lora_sdr for proper LoRa PHY decoding. Due to NumPy 2.x compatibility requirements, GNU Radio must be compiled from source:

**Prerequisites:**
```bash
# Install system dependencies
sudo apt-get install cmake libboost-all-dev libgmp-dev libmpfr-dev \
    liblog4cpp5-dev libspdlog-dev libfmt-dev libvolk-dev \
    pybind11-dev python3-pybind11
```

**Build GNU Radio 3.10 (with NumPy 2.x support):**
```bash
cd ~/projects/ground-station/backend
source venv/bin/activate

# Install Python packages
pip install packaging pybind11

# Clone and build GNU Radio
cd /tmp
git clone --recursive https://github.com/gnuradio/gnuradio.git
cd gnuradio
git checkout maint-3.10
mkdir build && cd build

# Configure to install into venv
cmake -DCMAKE_BUILD_TYPE=Release \
      -DENABLE_PYTHON=ON \
      -DENABLE_GR_QTGUI=OFF \
      -DENABLE_TESTING=OFF \
      -DPython3_EXECUTABLE=$VIRTUAL_ENV/bin/python3 \
      -DPYTHON_EXECUTABLE=$VIRTUAL_ENV/bin/python3 \
      -DCMAKE_INSTALL_PREFIX=$VIRTUAL_ENV \
      ..

# Build and install (takes 15-30 minutes)
make -j$(nproc)
make install
```

**Build gr-lora_sdr:**
```bash
cd /tmp
git clone https://github.com/tapparelj/gr-lora_sdr.git
cd gr-lora_sdr
mkdir build && cd build

cmake -DCMAKE_INSTALL_PREFIX=$VIRTUAL_ENV ..
make -j$(nproc)
make install
```

**Configure library paths:**
```bash
cd ~/projects/ground-station/backend
echo 'export LD_LIBRARY_PATH=$VIRTUAL_ENV/lib:$LD_LIBRARY_PATH' >> venv/bin/activate
source venv/bin/activate
```

**Verify installation:**
```bash
python -c "from gnuradio import gr, lora_sdr; print('LoRa decoder ready!')"
```

> **Note:** This is only required for development. Docker images include pre-built GNU Radio and gr-lora_sdr.

## Development Workflow with pyproject.toml

The project's `pyproject.toml` provides comprehensive tooling configuration:

### Code Formatting
```bash
# Format code with Black (line length: 100)
black .

# Sort imports with isort
isort .
```

### Testing

**Backend Tests (Python)**
```bash
cd backend

# Run tests with coverage
pytest

# Run specific test markers
pytest -m unit          # Run only unit tests
pytest -m integration   # Run only integration tests
pytest -m slow          # Run slow tests

# Generate coverage reports
pytest --cov=crud --cov=server --cov=controllers --cov-report=html
```

**Frontend Tests (JavaScript/React)**
```bash
cd frontend

# Run unit/component tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests (requires dev server running)
npm run test:e2e

# Run E2E tests with interactive UI
npm run test:e2e:ui
```

See [frontend/TESTING.md](frontend/TESTING.md) for comprehensive testing documentation.

### Pre-commit Hooks (Recommended)
```bash
# Install pre-commit hooks to automatically check code before commits
pre-commit install

# Run hooks manually on all files
pre-commit run --all-files
```

## Package Information

The project is configured as a Python package with the following metadata:
- **Name:** ground-station
- **Version:** 0.1.0
- **Python Support:** 3.8, 3.9, 3.10, 3.11, 3.12
- **License:** GPL-3.0-only
- **Entry Point:** `ground-station` command (after installation)

You can install the package and use it as a command-line tool:
```bash
pip install -e .
ground-station  # Starts the application
```
