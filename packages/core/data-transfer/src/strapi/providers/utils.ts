import { randomUUID } from 'crypto';
import { RawData, WebSocket } from 'ws';

import type { Client, Server } from '../../../types/remote/protocol';
import {
  ProviderError,
  ProviderTransferError,
  ProviderInitializationError,
} from '../../errors/providers';

interface IDispatcherState {
  transfer?: { kind: Client.TransferKind; id: string };
}

interface IDispatchOptions {
  attachTransfer?: boolean;
}

type Dispatch<T> = Omit<T, 'transferID' | 'uuid'>;

export const createDispatcher = (
  ws: WebSocket,
  retryMessageOptions = {
    retryMessageMaxRetries: 5,
    retryMessageTimeout: 15000,
  }
) => {
  const state: IDispatcherState = {};

  type DispatchMessage = Dispatch<Client.Message>;

  const dispatch = async <U = null>(
    message: DispatchMessage,
    options: IDispatchOptions = {}
  ): Promise<U | null> => {
    if (!ws) {
      throw new Error('No websocket connection found');
    }

    return new Promise<U | null>((resolve, reject) => {
      const uuid = randomUUID();
      const payload = { ...message, uuid };
      let numberOfTimesMessageWasSent = 0;

      if (options.attachTransfer) {
        Object.assign(payload, { transferID: state.transfer?.id });
      }

      const stringifiedPayload = JSON.stringify(payload);
      ws.send(stringifiedPayload, (error) => {
        if (error) {
          reject(error);
        }
      });
      const { retryMessageMaxRetries, retryMessageTimeout } = retryMessageOptions;
      const sendPeriodically = () => {
        if (numberOfTimesMessageWasSent <= retryMessageMaxRetries) {
          numberOfTimesMessageWasSent += 1;
          ws.send(stringifiedPayload, (error) => {
            if (error) {
              reject(error);
            }
          });
        } else {
          reject(new ProviderError('error', 'Request timed out'));
        }
      };
      const interval = setInterval(sendPeriodically, retryMessageTimeout);

      const onResponse = (raw: RawData) => {
        const response: Server.Message<U> = JSON.parse(raw.toString());
        if (response.uuid === uuid) {
          clearInterval(interval);
          if (response.error) {
            return reject(new ProviderError('error', response.error.message));
          }
          resolve(response.data ?? null);
        } else {
          ws.once('message', onResponse);
        }
      };

      ws.once('message', onResponse);
    });
  };

  const dispatchCommand = <U extends Client.Command>(
    payload: {
      command: U;
    } & ([Client.GetCommandParams<U>] extends [never]
      ? unknown
      : { params?: Client.GetCommandParams<U> })
  ) => {
    return dispatch({ type: 'command', ...payload } as Client.CommandMessage);
  };

  const dispatchTransferAction = async <T>(action: Client.Action['action']) => {
    const payload: Dispatch<Client.Action> = { type: 'transfer', kind: 'action', action };

    return dispatch<T>(payload, { attachTransfer: true }) ?? Promise.resolve(null);
  };

  const dispatchTransferStep = async <
    T,
    A extends Client.TransferPushMessage['action'] = Client.TransferPushMessage['action'],
    S extends Client.TransferPushStep = Client.TransferPushStep
  >(
    payload: {
      step: S;
      action: A;
    } & (A extends 'stream' ? { data: Client.GetTransferPushStreamData<S> } : unknown)
  ) => {
    const message: Dispatch<Client.TransferPushMessage> = {
      type: 'transfer',
      kind: 'step',
      ...payload,
    };

    return dispatch<T>(message, { attachTransfer: true }) ?? Promise.resolve(null);
  };

  const setTransferProperties = (
    properties: Exclude<IDispatcherState['transfer'], undefined>
  ): void => {
    state.transfer = { ...properties };
  };

  return {
    get transferID() {
      return state.transfer?.id;
    },

    get transferKind() {
      return state.transfer?.kind;
    },

    setTransferProperties,

    dispatch,
    dispatchCommand,
    dispatchTransferAction,
    dispatchTransferStep,
  };
};

type WebsocketParams = ConstructorParameters<typeof WebSocket>;
type Address = WebsocketParams[0];
type Options = WebsocketParams[2];

export const connectToWebsocket = (address: Address, options?: Options): Promise<WebSocket> => {
  return new Promise((resolve, reject) => {
    const server = new WebSocket(address, options);
    server.once('open', () => {
      resolve(server);
    });

    server.on('unexpected-response', (_req, res) => {
      if (res.statusCode === 401) {
        return reject(
          new ProviderInitializationError(
            'Failed to initialize the connection: Authentication Error'
          )
        );
      }

      if (res.statusCode === 403) {
        return reject(
          new ProviderInitializationError(
            'Failed to initialize the connection: Authorization Error'
          )
        );
      }

      if (res.statusCode === 404) {
        return reject(
          new ProviderInitializationError(
            'Failed to initialize the connection: Data transfer is not enabled on the remote host'
          )
        );
      }

      return reject(
        new ProviderInitializationError(
          `Failed to initialize the connection: Unexpected server response ${res.statusCode}`
        )
      );
    });

    server.once('error', (err) => {
      reject(
        new ProviderTransferError(err.message, {
          details: {
            error: err.message,
          },
        })
      );
    });
  });
};

export const trimTrailingSlash = (input: string): string => {
  return input.replace(/\/$/, '');
};