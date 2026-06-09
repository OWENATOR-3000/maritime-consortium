'use strict';

function shipmentKey(shipmentId) {
  return `SHIPMENT_${shipmentId}`;
}

function auditKey(shipmentId, eventId) {
  return `AUDIT_${shipmentId}_${eventId}`;
}

function documentKey(documentId) {
  return `DOCUMENT_${documentId}`;
}

module.exports = {
  shipmentKey,
  auditKey,
  documentKey
};
