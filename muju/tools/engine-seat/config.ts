import { z } from 'zod';
import { actionRequestSchema, joinSchema, roomIdSchema, tokenSchema } from '../../server/schema';
import { joinRoom, normalizeServer, readRoom, roomRequest } from '../../src/online/client';
import type { RoomAdmission, RoomConnection, RoomSnapshot } from '../../src/online/types';
import { assertAuthenticatedSeat, assertSeatRoom, seatContractSchema, type SeatContract } from './contract';
import type { SeatJournal } from './runner';

const credentialsSchema = z.object({ roomId: roomIdSchema, player: z.enum(['white', 'black']), token: tokenSchema }).strict();
const common = { serverUrl: z.string().transform(normalizeServer), roomId: roomIdSchema,
  seed: z.number().int().min(0).max(0xffffffff), stateFile: z.string().min(1) };
export const seatConfigSchema = z.discriminatedUnion('mode', [
  z.object({ ...common, ...seatContractSchema.options[0].shape,
    name: joinSchema.shape.name.optional(), inviteCode: joinSchema.shape.inviteCode.optional(), credentials: credentialsSchema.optional() }).strict(),
  z.object({ ...common, ...seatContractSchema.options[1].shape, credentials: credentialsSchema }).strict(),
]).superRefine((config, context) => {
  if (config.credentials && config.credentials.roomId !== config.roomId) context.addIssue({ code: 'custom', message: 'Issued credentials belong to a different room.' });
  if (config.mode === 'standard-smoke' && (config.credentials ? config.name !== undefined || config.inviteCode !== undefined : !config.name || !config.inviteCode)) {
    context.addIssue({ code: 'custom', message: 'Smoke mode requires either issued credentials or both name and inviteCode, never both admission methods.' });
  }
});
export type SeatConfig = z.infer<typeof seatConfigSchema>;
export const seatJournalSchema = z.object({ version: z.literal(2), seed: z.number().int().min(0).max(0xffffffff),
  admission: z.enum(['issued', 'join']), contract: seatContractSchema,
  connection: z.object({ serverUrl: z.string().transform(normalizeServer), ...credentialsSchema.shape }).strict(),
  pending: actionRequestSchema.optional(),
}).strict().superRefine((journal, context) => {
  if (journal.contract.mode === 'pinned' && journal.admission !== 'issued') context.addIssue({ code: 'custom', message: 'Pinned seats require issued credentials.' });
});
export function contractFor(config: SeatConfig): SeatContract {
  return config.mode === 'standard-smoke' ? { mode: config.mode } : { mode: config.mode,
    expectedMatchPolicy: { ...config.expectedMatchPolicy }, expectedTimeControl: { ...config.expectedTimeControl }, expectedHandicap: config.expectedHandicap };
}
export function assertSeatConfiguration(journal: SeatJournal, config: SeatConfig): void {
  journal = seatJournalSchema.parse(journal);
  config = seatConfigSchema.parse(config);
  const admission = config.credentials ? 'issued' : 'join';
  if (journal.connection.serverUrl !== config.serverUrl || journal.connection.roomId !== config.roomId || journal.seed !== config.seed || journal.admission !== admission ||
      JSON.stringify(journal.contract) !== JSON.stringify(contractFor(config))) throw new Error('Stored seat identity or expected contract differs from the configuration.');
  if (config.credentials && (journal.connection.player !== config.credentials.player || journal.connection.token !== config.credentials.token)) {
    throw new Error('Stored issued credentials differ from the configuration.');
  }
}
interface AdmissionTransport {
  read(connection: RoomConnection): Promise<RoomSnapshot>;
  inspect(serverUrl: string, roomId: string): Promise<RoomSnapshot>;
  join(serverUrl: string, roomId: string, name: string, inviteCode: string): Promise<RoomAdmission>;
}
/** reserve() creates the private crash marker before any possible join. Issued
 * credentials only authenticate a read and can never call the join endpoint. */
export async function initializeSeat(config: SeatConfig, reserve: () => void, transport: AdmissionTransport = {
  read: readRoom, inspect: (serverUrl, roomId) => roomRequest<RoomSnapshot>(serverUrl, `/${roomId}`), join: joinRoom,
}): Promise<SeatJournal> {
  config = seatConfigSchema.parse(config);
  const contract = contractFor(config), expected = { roomId: config.roomId, contract };
  if (config.credentials) {
    const connection = { ...config.credentials, serverUrl: config.serverUrl };
    const room = await transport.read(connection);
    assertSeatRoom(room, expected);
    assertAuthenticatedSeat(room, connection.player);
    reserve();
    return { version: 2, admission: 'issued', connection, seed: config.seed, contract };
  }
  assertSeatRoom(await transport.inspect(config.serverUrl, config.roomId), expected);
  reserve();
  if (config.mode !== 'standard-smoke' || !config.name || !config.inviteCode) throw new Error('Only Standard smoke seats can join a room.');
  const admission = await transport.join(config.serverUrl, config.roomId, config.name, config.inviteCode);
  const credentials = credentialsSchema.parse(admission.credentials);
  if (credentials.roomId !== config.roomId) throw new Error('Joined credentials belong to a different room.');
  assertSeatRoom(admission.room, expected);
  assertAuthenticatedSeat(admission.room, credentials.player);
  return { version: 2, admission: 'join', connection: { ...credentials, serverUrl: config.serverUrl }, seed: config.seed, contract };
}
