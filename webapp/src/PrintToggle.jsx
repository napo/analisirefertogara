// "Includi nel PDF" checkbox of a block of the analysis page (never drawn in the PDF itself)
export default function PrintToggle({ checked, onChange, label = 'Includi nel PDF', printing = false }) {
  if (printing) return null
  return (
    <label className={`vs-print-toggle${checked ? '' : ' off'}`} title={checked ? 'Questo blocco è incluso nel report PDF' : 'Questo blocco non sarà incluso nel report PDF'}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  )
}
