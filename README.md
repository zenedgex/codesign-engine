# ZenEdgeX Atelier

The best chip for your workload.

- **Atelier** (formerly CodeSign Engine): designs AI accelerators around your workload and your area, power and performance targets: https://zenedgex.in/engine/
- **Sutra**, the proof: a digital in-memory-compute accelerator IP with a RISC-V control core, designed by Atelier for YOLOv8n: https://zenedgex.in/ip/
- Live demo: https://zenedgex.in/demo/
- Contact: hello@zenedgex.in

## Try Atelier Studio

Atelier Studio runs in your browser, on your machine only. The trial does everything but export:
create a project from a reference architecture or your own RTL, explore designs for a workload
(each compiled by the compiler and timed on the SoC model), and build and simulate the one you
pick against the reference model. Exporting the RTL needs a license from ZenEdgeX.

macOS on Apple silicon (Linux x86_64 later), with `uv`, Docker and the Xcode command-line tools.
Trial downloads are by invitation: write to hello@zenedgex.in with your GitHub username. Then, with
the release's four files in one folder under your home folder:

```sh
shasum -a 256 -c SHA256SUMS
tar xzf atelier-studio-trial-0.1.5.tar.gz
cd atelier-studio-trial-0.1.5
./install.sh
./studio.sh my-project
```

Watch the walkthrough: https://zenedgex.in/demo/

This repository holds the website and the released package only. Proprietary preview; do not
redistribute.
