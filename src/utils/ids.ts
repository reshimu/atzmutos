import { nanoid } from 'nanoid'
export const sessionId = () => `ses_${nanoid(12)}`
export const eventId = () => `evt_${nanoid(12)}`
export const reportId = () => `beiur_${nanoid(12)}`
