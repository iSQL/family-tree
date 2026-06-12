import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useDeletePhoto, useUploadPhoto } from '../../hooks/useMutations';
import { useOnline } from '../../hooks/useOnline';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { STR } from '../../lib/strings';

const MAX_SIZE = 800;
const JPEG_QUALITY = 0.9;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Slika ne može da se učita.'));
    img.src = src;
  });
}

/** Iseče kvadrat iz slike (px koordinate react-easy-crop-a) → JPEG blob ≤800px. */
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const size = Math.min(MAX_SIZE, Math.max(1, Math.round(area.width)));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nije podržan.');
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Isecanje slike nije uspelo.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export interface PhotoUploadDialogProps {
  open: boolean;
  onClose: () => void;
  personId: number;
  currentPhotoId: string | null;
}

export function PhotoUploadDialog({ open, onClose, personId, currentPhotoId }: PhotoUploadDialogProps) {
  const online = useOnline();
  const upload = useUploadPhoto();
  const removePhoto = useDeletePhoto();

  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  // Oslobodi objectURL pri zatvaranju/zameni
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  useEffect(() => {
    if (!open) {
      setSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setArea(null);
    }
  }, [open]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setArea(areaPixels);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    e.target.value = '';
  };

  const confirm = async () => {
    if (!src || !area) return;
    setProcessing(true);
    try {
      const blob = await cropToBlob(src, area);
      upload.mutate(
        { personId, blob },
        {
          onSuccess: () => onClose(),
          onSettled: () => setProcessing(false),
        },
      );
    } catch {
      setProcessing(false);
    }
  };

  const busy = processing || upload.isPending || removePhoto.isPending;

  return (
    <Dialog open={open} onClose={onClose} title={STR.photo.dialogTitle}>
      {src ? (
        <div className="space-y-3">
          <p className="text-xs text-stone-500 dark:text-stone-400">{STR.photo.hint}</p>
          <div className="relative h-72 overflow-hidden rounded-lg bg-stone-900">
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            {STR.photo.zoom}
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-amber-700 dark:accent-amber-500"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSrc(null)} disabled={busy}>
              {STR.common.cancel}
            </Button>
            <Button
              onClick={() => void confirm()}
              disabled={busy || !online || !area}
              title={!online ? STR.common.offlineDisabled : undefined}
            >
              {STR.photo.upload}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-300 text-sm text-stone-500 hover:border-amber-600 hover:text-amber-700 dark:border-stone-600 dark:text-stone-400">
            <ImagePlus size={28} aria-hidden="true" />
            {STR.photo.pick}
            <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </label>
          {currentPhotoId && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => removePhoto.mutate(personId, { onSuccess: () => onClose() })}
              disabled={busy || !online}
              title={!online ? STR.common.offlineDisabled : undefined}
            >
              <Trash2 size={14} aria-hidden="true" />
              {STR.photo.remove}
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}
