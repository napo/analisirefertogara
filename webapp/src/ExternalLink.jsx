import { followExternalLink } from './external-link.js'

export default function ExternalLink({ href, children, ...props }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={event => followExternalLink(event, href)} {...props}>
      {children}
    </a>
  )
}
