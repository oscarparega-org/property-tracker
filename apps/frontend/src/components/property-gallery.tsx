'use client';

import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/material-icon';

type GalleryImage = {
  id: string;
  url: string;
  alt: string | null;
};

export function PropertyGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const preview = images.slice(0, 4);

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
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
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
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
        <div className="carousel-backdrop" role="dialog" aria-modal="true" aria-label={`Galería de ${title}`}>
          <div className="carousel-shell">
            <div className="carousel-topbar">
              <span>
                {activeIndex + 1} / {images.length}
              </span>
              <button type="button" onClick={() => setActiveIndex(null)} aria-label="Cerrar galería">
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="carousel-stage">
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
        </div>
      )}
    </>
  );
}
