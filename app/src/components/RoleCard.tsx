import { Icon } from './Icon'

/**
 * The planter/sponsor choice card, shared by CreateAccount (where the role is
 * first picked) and ProfileSetup (where it can be changed later).
 */
export function RoleCard({
  icon,
  title,
  body,
  selected,
  onSelect,
}: {
  icon: 'tree' | 'wallet'
  title: string
  body: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`card flex gap-3 text-left transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
          selected
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container text-on-surface-variant'
        }`}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-headline text-headline-md font-bold text-on-surface">
          {title}
        </span>
        <span className="mt-0.5 block text-label-lg text-on-surface-variant">
          {body}
        </span>
      </span>
      <span
        className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'
        }`}
      >
        {selected && <Icon name="check" size={11} />}
      </span>
    </button>
  )
}
