# Co-Design Engine

Design an AI accelerator and its compiler as one.

- Website: https://zenedgex.github.io/codesign-engine/ (zenedgex.in coming soon)
- Live demo: https://zenedgex.github.io/codesign-engine/demo/
- Contact: contact@soctai.com

## Try the engine

Python 3.12 or later, macOS or Linux:

```sh
pip install https://github.com/zenedgex/codesign-engine/releases/download/v0.1.1/codesign_engine-0.1.1-py3-none-any.whl
codesign-engine info
codesign-engine compile --m 64 --k 128 --n 128 --show-ir
codesign-engine best-compiler --rows 32 --cols 32 --dataflow ws
codesign-engine explore --clock-ps 800
codesign-engine search --method planner --budget 20
```

The package runs the MLIR compiler path, the analytical (T0) estimates and the search loop on
a T0-based proxy. RTL simulation, synthesis and place-and-route run in a design-partner pilot on
your EDA flow.

This repository holds the website and the released package only. Proprietary preview; do not
redistribute.
