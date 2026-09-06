export const mainContentId = 'main-content';

export function SkipLink() {
  return (
    <a className="skip-link" href={`#${mainContentId}`}>
      Saltar al contenido
    </a>
  );
}
