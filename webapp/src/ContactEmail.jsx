import { authorEmail } from './config.js'
import { followExternalLink } from './external-link.js'

// Link to write to the author. The address is in the page only once it runs in a browser, and in the link
// only at the click: the static files and the markup hold no "mailto:". children: the text of the link
// (default: the address).
export default function ContactEmail({ subject = 'Referto Volley', body = '', children }) {
  const address = typeof window === 'undefined' ? '' : authorEmail()
  const open = event => {
    event.preventDefault()
    const query = new URLSearchParams({ subject, ...(body ? { body } : {}) }).toString().replace(/\+/g, '%20')
    const url = `mailto:${authorEmail()}?${query}`
    if (!followExternalLink(event, url)) window.location.href = url
  }
  return <a href="#contatto" onClick={open}>{children || address}</a>
}
