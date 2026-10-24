# xmb-waves

An original, from-scratch WebGL2 recreation of a well-known console menu
background: a flowing, luminous wave of fine lines drifting across a softly
coloured gradient, with glowing sparkles around it, whose colours follow the
time of day and the month.

Not affiliated with, endorsed by or connected to Sony Interactive Entertainment. PlayStation, PS3 and XMB are trademarks or terms of Sony Interactive Entertainment.

## Process (clean room)

- A functional specification ([docs/SPEC.md](docs/SPEC.md)) was written by a
  separate party from observation and analysis of the original effect. It
  describes what the viewer sees, with no parameter values, colours, textures
  or code.
- This implementation was written from that specification alone, with no
  access to the original's code, data, firmware or system files, and without
  looking at anyone else's reimplementation.
- At first it was to be tuned against numeric scores only; that private
  scorer was dropped before any score was reported. Tuning is instead done by
  comparing renders side by side with public recordings of the original effect
  running. Every reference used is listed in
  [docs/REFERENCES.md](docs/REFERENCES.md).
- Every value, colour and algorithm here is original. No assets are shipped;
  everything is generated in code (see [docs/ASSETS.md](docs/ASSETS.md)).

## Licence

MIT, see [LICENSE](LICENSE).
