'use client';

import { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/material-icon';

type GalleryImage = {
  id: string;
  url: string;
  alt: string | null;
};

export function PropertyGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<number | null>(null);
  const preview = images.slice(0, 4);

  useEffect(() => {
    if (activeIndex === null) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null);
      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => (current === null ? null : (current - 1 + images.length) % images.length));
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => (current === null ? null : (current + 1) % images.length));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (dialog?.open) dialog.close();
    };
  }, [activeIndex, images.length]);

  if (!images.length) {
    return <div className="detail-no-image">Sin fotografías</div>;
  }

  const showPrevious = () =>
    setActiveIndex((current) => (current === null ? 0 : (current - 1 + images.length) % images.length));
  const showNext = () => setActiveIndex((current) => (current === null ? 0 : (current + 1) % images.length));

  return (
    <>
      <section className={`gallery-preview gallery-count-${preview.length}`} aria-label="Vista previa de fotografías">
        {preview.map((image, index) => (
          <button
            type="button"
            className={index === 0 ? 'gallery-preview-main' : 'gallery-preview-side'}
            key={image.id}
            onClick={() => setActiveIndex(index)}
            aria-label={`Abrir foto ${index + 1} de ${images.length}`}
          >
            {/* Listing images can come from arbitrary model-provided domains. */}
            <img src={image.url} alt={image.alt ?? `${title}, foto ${index + 1}`} />
          </button>
        ))}
        <button type="button" className="gallery-open-all" onClick={() => setActiveIndex(0)}>
          Ver {images.length} fotos
        </button>
      </section>

      {activeIndex !== null && images[activeIndex] && (
        <dialog
          ref={dialogRef}
          className="carousel-backdrop"
          aria-label={`Galería de ${title}`}
          onCancel={() => setActiveIndex(null)}
        >
          <div className="carousel-shell">
            <div className="carousel-topbar">
              <span>
                {activeIndex + 1} / {images.length}
              </span>
              <button type="button" onClick={() => setActiveIndex(null)} aria-label="Cerrar galería">
                <MaterialIcon name="close" />
              </button>
            </div>
            <div
              className="carousel-stage"
              onTouchStart={(event) => {
                touchStart.current = event.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const end = event.changedTouches[0]?.clientX;
                if (touchStart.current === null || end === undefined) return;
                const delta = end - touchStart.current;
                touchStart.current = null;
                if (Math.abs(delta) < 45) return;
                if (delta > 0) showPrevious();
                else showNext();
              }}
            >
              {images.length > 1 && (
                <button
                  type="button"
                  className="carousel-arrow previous"
                  onClick={showPrevious}
                  aria-label="Foto anterior"
                >
                  <MaterialIcon name="chevronLeft" />
                </button>
              )}
              <img src={images[activeIndex].url} alt={images[activeIndex].alt ?? `${title}, foto ${activeIndex + 1}`} />
              {images.length > 1 && (
                <button type="button" className="carousel-arrow next" onClick={showNext} aria-label="Foto siguiente">
                  <MaterialIcon name="chevronRight" />
                </button>
              )}
            </div>
            <div className="carousel-caption">
              <span>{images[activeIndex].alt ?? title}</span>
              <small>Usa ← → para navegar y Esc para cerrar</small>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
