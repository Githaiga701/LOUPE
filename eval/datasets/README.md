# Evaluation datasets

Spec §14: build your own labelled set from day one. Public sets (FaceForensics++, DFDC) are for development; detectors that score well there often fail on real material.

Layout (one folder per class, a `labels.csv` at the root):

```
real-phone/        unedited photos from phones you control
real-whatsapp/     the same photos after a WhatsApp round-trip
real-screenshot/   screenshots of the same photos
real-edited/       honest edits: crop, filter, colour grade (tests false positives)
ai-current/        images from current generators; refresh quarterly
```

`labels.csv`: `path,label,source,notes`. Never commit personal images; this folder is git-ignored except this file.
