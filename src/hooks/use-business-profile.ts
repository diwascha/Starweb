'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { CompanyProfile } from '@/lib/types';
import { onSettingUpdate } from '@/services/settings-service';
import { getEntity, resolveEntityForPath, type BusinessEntity, type BusinessEntityId } from '@/lib/business-entities';
/**
 * The letterhead for the business that owns the current page.
 *
 * Every document screen used to repeat the same four lines - a useState
 * seeded with a locally-defined default, a useEffect, an onSettingUpdate
 * subscription, and a `|| SOME_DEFAULT` fallback. Thirteen copies for the
 * packaging company and eight for the transport one, each free to disagree
 * about the default, and at least one (report/view) that forgot the
 * fallback entirely and rendered a blank letterhead until settings loaded.
 *
 * Called with no argument it infers the entity from the route, so a page
 * under /fleet gets Sijan's letterhead and one under /crm gets Shivam's
 * without either having to say so - and a module added later is correct the
 * moment its path is listed in the registry. Pass an explicit id for the
 * rare screen that renders another entity's document (Settings, which shows
 * a form per entity, is the main one).
 */
export function useBusinessProfile(entityId?: BusinessEntityId): CompanyProfile {
  const pathname = usePathname();
  const entity: BusinessEntity = entityId ? getEntity(entityId) : resolveEntityForPath(pathname);
  const [profile, setProfile] = useState<CompanyProfile>(entity.defaults);

  useEffect(() => {
    // Reset to this entity's own defaults first, so switching entity never
    // shows the previous one's letterhead while the new value loads.
    setProfile(entity.defaults);
    const unsub = onSettingUpdate(entity.settingKey, (s) => {
      setProfile(s?.value || entity.defaults);
    });
    return () => unsub();
  }, [entity.settingKey, entity.defaults]);

  return profile;
}

/** The entity that owns the current route, when a page needs its label or id
 *  rather than its letterhead. */
export function useBusinessEntity(entityId?: BusinessEntityId): BusinessEntity {
  const pathname = usePathname();
  return entityId ? getEntity(entityId) : resolveEntityForPath(pathname);
}
