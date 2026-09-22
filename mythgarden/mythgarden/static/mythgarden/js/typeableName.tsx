import React, {useEffect, useRef, useState} from "react";
import { postUserData } from "./ajax";
import { HeroProps} from "./hero";

type TypeableNameProps = Pick<HeroProps, 'name' | 'isDefaultName'>

export default function TypeableName ({ name, isDefaultName }: TypeableNameProps): JSX.Element {
  const DEBOUNCE_DELAY_MS = 2000
  const [typedName, setTypedName] = useState(isDefaultName ? '' : name);
  const latestName = useRef(typedName)
  const dirty = useRef(false)

  const saveName = async () => {
    const value = latestName.current.trim()
    if (!dirty.current || !value) return
    dirty.current = false
    const saved = await postUserData({ name: value })
    if (!saved && latestName.current.trim() === value) dirty.current = true
  }

  useEffect(() => {
    if (!dirty.current) {
      latestName.current = isDefaultName ? '' : name
      setTypedName(latestName.current)
    }
  }, [name, isDefaultName]);

  useEffect(() => {
    if (!dirty.current) return
    const timeoutId = setTimeout(() => { void saveName() }, DEBOUNCE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [typedName]);

  const onKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.target.blur();
    }
  }

  return (
    <div className="name">
      <textarea
        onKeyDown={onKeyDown}
        aria-label="Farmer name"
        onBlur={() => { void saveName() }}
        onChange={e => {
          latestName.current = e.target.value
          dirty.current = true
          setTypedName(e.target.value)
        }}
        value={typedName}
        maxLength={16}
        rows={1}
        spellCheck={false}
        tabIndex={-1}
        placeholder={isDefaultName ? name : ''}></textarea>
    </div>
  )
}
