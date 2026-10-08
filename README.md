# ZenEdgeX Atelier

The best chip for your workload.

- **Atelier** (formerly CodeSign Engine): designs AI accelerators around your workload and your area, power and performance targets: https://zenedgex.in/engine/
- **Sutra**, the proof: a digital in-memory-compute accelerator IP with a RISC-V control core, designed by Atelier for YOLOv8n: https://zenedgex.in/ip/
- Live demo: https://zenedgex.in/demo/
- Contact: hello@zenedgex.in

## Try Atelier

Python 3.12 or later, macOS or Linux:

```sh
pip install https://github.com/zenedgex/codesign-engine/releases/download/v0.3.0/codesign_engine-0.3.0-py3-none-any.whl
codesign-engine info
codesign-engine compile --m 64 --k 128 --n 128 --show-ir
codesign-engine best-compiler --rows 32 --cols 32 --dataflow ws
codesign-engine explore --clock-ps 800
codesign-engine search --method planner --budget 20

# a whole network: YOLOv8n at 640x640, sized for your requirements, with the physical-design kit
codesign-engine spec-example --network > net.json
codesign-engine design --spec net.json --export out/ --flow
```

The package runs the MLIR compiler path, the analytical (T0) estimates, the search and the
design export. With `--flow`, a network design comes with a physical-design kit that synthesizes
and floorplans its blocks on ASAP7 with OpenROAD-flow-scripts (needs Docker). RTL simulation and
the port to your foundry run in a design-partner pilot.

This repository holds the website and the released package only. Proprietary preview; do not
redistribute.
