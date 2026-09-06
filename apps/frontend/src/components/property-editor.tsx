"use client";
import { ActionForm } from "@/components/action-form";
import { localDateInput } from '@/lib/date-input';


import { useRef } from "react";
import { savePropertyAction, setArchivedAction } from "@/lib/property-actions";
import { MaterialIcon } from "@/components/material-icon";
import type { PropertyDto } from "@template/shared";

type Props = { property: PropertyDto; onClose: () => void; creating?: boolean };

const statuses = [
  ["NEW", "Nueva"],
  ["CONTACTED", "Contactada"],
  ["VISIT_SCHEDULED", "Visita agendada"],
  ["VISITED", "Visitada"],
  ["OFFER_MADE", "Oferta enviada"],
  ["REJECTED", "Descartada"],
  ["PURCHASED", "Comprada"],
] as const;

function TextField({
  label,
  name,
  value,
  type = "text",
  step,
}: {
  label: string;
  name: string;
  value: string | number | null;
  type?: string;
  step?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input name={name} type={type} step={step} defaultValue={value ?? ""} />
    </label>
  );
}

function TextArea({ label, name, value, rows = 4 }: { label: string; name: string; value: string | null; rows?: number }) {
  return (
    <label className="field-wide">
      <span>{label}</span>
      <textarea name={name} defaultValue={value ?? ""} rows={rows} />
    </label>
  );
}

export function PropertyEditor({ property, onClose, creating = false }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const features = (category: "AREA" | "EQUIPMENT" | "OTHER") =>
    property.features.filter((item) => item.category === category).map((item) => item.name).join("\n");

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <dialog className="editor-modal" open ref={dialogRef}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{creating ? "Nueva propiedad manual" : property.publicationStatus === "DRAFT" ? "Revisar borrador" : "Editar propiedad"}</span>
            <h2>{property.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar editor"><MaterialIcon name="close" /></button>
        </div>

        <ActionForm action={savePropertyAction} className="editor-form">
          <input type="hidden" name="id" value={property.id} />
          <section>
            <h3>Fuente y publicación</h3>
            <div className="field-grid">
              <TextField label="Portal" name="sourceProvider" value={property.sourceProvider} />
              <TextField label="URL (opcional)" name="sourceUrl" type="url" value={property.sourceUrl} />
              <TextField label="ID del portal" name="sourceListingId" value={property.sourceListingId} />
              <TextField label="Clave" name="sourceListingKey" value={property.sourceListingKey} />
              <TextField label="Título" name="title" value={property.title} />
              <label>
                <span>Tipo</span>
                <select name="propertyType" defaultValue={property.propertyType}>
                  <option value="APARTMENT">Departamento</option>
                  <option value="HOUSE">Casa</option>
                  <option value="LAND">Terreno</option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>
              <TextField label="Precio" name="priceAmount" type="number" step="0.01" value={property.priceAmount} />
              <TextField label="Moneda" name="priceCurrency" value={property.priceCurrency} />
              <TextArea label="Descripción" name="description" value={property.description} rows={8} />
            </div>
          </section>

          <section>
            <h3>Ubicación</h3>
            <div className="field-grid">
              <TextField label="Calle" name="street" value={property.street} />
              <TextField label="Número exterior" name="exteriorNumber" value={property.exteriorNumber} />
              <TextField label="Número interior" name="interiorNumber" value={property.interiorNumber} />
              <TextField label="Colonia" name="neighborhood" value={property.neighborhood} />
              <TextField label="Municipio / alcaldía" name="municipality" value={property.municipality} />
              <TextField label="Estado" name="state" value={property.state} />
              <TextField label="Código postal" name="postalCode" value={property.postalCode} />
              <TextField label="País" name="countryCode" value={property.countryCode} />
              <TextField label="Latitud" name="latitude" type="number" step="any" value={property.latitude} />
              <TextField label="Longitud" name="longitude" type="number" step="any" value={property.longitude} />
              <TextField label="Dirección completa" name="formattedAddress" value={property.formattedAddress} />
            </div>
          </section>

          <section>
            <h3>Características</h3>
            <div className="field-grid">
              <TextField label="Terreno (m²)" name="landAreaM2" type="number" step="0.01" value={property.landAreaM2} />
              <TextField label="Construcción (m²)" name="constructionAreaM2" type="number" step="0.01" value={property.constructionAreaM2} />
              <TextField label="Recámaras" name="bedrooms" type="number" value={property.bedrooms} />
              <TextField label="Baños" name="bathrooms" type="number" step="0.5" value={property.bathrooms} />
              <TextField label="Estacionamientos" name="parkingSpaces" type="number" value={property.parkingSpaces} />
              <TextField label="Tipo de estacionamiento" name="parkingType" value={property.parkingType} />
              <label><span>Cuarto de servicio</span><select name="serviceRoom" defaultValue={property.serviceRoom === null ? "" : String(property.serviceRoom)}><option value="">Sin dato</option><option value="true">Sí</option><option value="false">No</option></select></label>
              <TextField label="Antigüedad (años)" name="propertyAgeYears" type="number" value={property.propertyAgeYears} />
              <TextField label="Conservación" name="condition" value={property.condition} />
              <TextField label="Orientación" name="orientation" value={property.orientation} />
              <TextField label="Uso de suelo" name="landUse" value={property.landUse} />
              <TextField label="Niveles del edificio" name="buildingLevels" type="number" value={property.buildingLevels} />
              <TextField label="Piso de la unidad" name="unitFloor" type="number" value={property.unitFloor} />
              <TextField label="Mantenimiento" name="maintenanceAmount" type="number" step="0.01" value={property.maintenanceAmount} />
              <TextField label="Moneda mantenimiento" name="maintenanceCurrency" value={property.maintenanceCurrency} />
              <TextField label="URL ficha QR" name="technicalSheetQrUrl" type="url" value={property.technicalSheetQrUrl} />
            </div>
          </section>

          <section>
            <h3>Contacto y medios</h3>
            <div className="field-grid">
              <TextField label="Agente" name="agentName" value={property.agentName} />
              <TextField label="Foto del agente" name="agentAvatarUrl" type="url" value={property.agentAvatarUrl} />
              <TextField label="Correo" name="agentEmail" type="email" value={property.agentEmail} />
              <TextField label="Oficina" name="officeName" value={property.officeName} />
              <TextField label="ID oficina" name="sourceOfficeId" value={property.sourceOfficeId} />
              <TextArea label="Teléfonos · uno por línea" name="agentPhones" value={property.agentPhones.join("\n")} rows={3} />
              <TextArea label="Fotos · una URL por línea" name="images" value={property.images.map((item) => item.url).join("\n")} rows={7} />
              <TextArea label="Áreas · una por línea" name="areaFeatures" value={features("AREA")} />
              <TextArea label="Equipo · uno por línea" name="equipmentFeatures" value={features("EQUIPMENT")} />
              <TextArea label="Otros · uno por línea" name="otherFeatures" value={features("OTHER")} />
            </div>
          </section>

          <section>
            <h3>Mi decisión</h3>
            <div className="field-grid">
              <label><span>Estado</span><select name="decisionStatus" defaultValue={property.decisionStatus}>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>Calificación</span><select name="rating" defaultValue={property.rating ?? ""}><option value="">Sin calificar</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
              <TextField label="Fecha de visita" name="visitAt" type="datetime-local" value={localDateInput(property.visitAt)} />
              <TextArea label="Notas" name="notes" value={property.notes} rows={5} />
              <TextArea label="Razón para descartar" name="rejectionReason" value={property.rejectionReason} rows={3} />
              <TextArea label="Metadatos originales (JSON)" name="sourceMetadata" value={JSON.stringify(property.sourceMetadata, null, 2)} rows={10} />
            </div>
          </section>

          <div className="modal-actions">
            <button className="button subtle" type="button" onClick={onClose}>Cancelar</button>
                        {creating || property.publicationStatus === "DRAFT" ? <>
              <button className="button subtle" type="submit" name="publicationStatus" value="DRAFT">Guardar borrador</button>
              <button className="button primary" type="submit" name="publicationStatus" value="PUBLISHED">Publicar</button>
            </> : <>
              <input type="hidden" name="publicationStatus" value="PUBLISHED" />
              <button className="button primary" type="submit">Guardar cambios</button>
            </>}
          </div>
        </ActionForm>

        {!creating && <ActionForm action={setArchivedAction.bind(null, property.id, !property.archivedAt)} className="archive-action">
          <button className="text-button" type="submit">{property.archivedAt ? "Restaurar propiedad" : "Archivar propiedad"}</button>
        </ActionForm>}
      </dialog>
    </div>
  );
}
