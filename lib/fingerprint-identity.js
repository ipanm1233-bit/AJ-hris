'use strict';

function normalized(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function machineNameAgrees(employee, machineName) {
  const machine = normalized(machineName);
  if (!machine) return true; // mesin lama boleh tidak mengirim nama
  const aliases = [employee?.finger_name, employee?.nama_karyawan, employee?.nama]
    .map(normalized).filter(Boolean);
  return aliases.some(alias => machine === alias || (machine.length >= 3 && (
    alias.startsWith(`${machine} `) || machine.startsWith(`${alias} `)
  )));
}

function addUniqueIdentifier(map, identifier, employee) {
  const key = normalized(identifier);
  if (!key) return;
  if (!map.has(key)) map.set(key, employee);
  else if (map.get(key)?._docId !== employee._docId) map.set(key, null);
}

module.exports = { machineNameAgrees, addUniqueIdentifier };
