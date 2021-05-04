/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { t, styled } from '@superset-ui/core';
import React, {
  FunctionComponent,
  useEffect,
  useState,
  useReducer,
  Reducer,
} from 'react';
import Tabs from 'src/components/Tabs';
import { Alert } from 'src/common/components';
import withToasts from 'src/messageToasts/enhancers/withToasts';
import {
  testDatabaseConnection,
  useSingleViewResource,
} from 'src/views/CRUD/hooks';
import { useCommonConf } from 'src/views/CRUD/data/database/state';
import { DatabaseObject } from 'src/views/CRUD/data/database/types';
import ExtraOptions from './ExtraOptions';
import SqlAlchemyForm from './SqlAlchemyForm';
import { StyledBasicTab, StyledModal } from './styles';

interface DatabaseModalProps {
  addDangerToast: (msg: string) => void;
  addSuccessToast: (msg: string) => void;
  onDatabaseAdd?: (database?: DatabaseObject) => void; // TODO: should we add a separate function for edit?
  onHide: () => void;
  show: boolean;
  database?: DatabaseObject | null; // If included, will go into edit mode
}

enum ActionType {
  textChange,
  inputChange,
  editorChange,
  fetched,
  initialLoad,
  reset,
}

interface DBReducerPayloadType {
  target?: string;
  name: string;
  json?: {};
  type?: string;
  checked?: boolean;
  value?: string;
}

type DBReducerActionType =
  | {
      type:
        | ActionType.textChange
        | ActionType.inputChange
        | ActionType.editorChange;
      payload: DBReducerPayloadType;
    }
  | {
      type: ActionType.fetched | ActionType.initialLoad;
      payload: Partial<DatabaseObject>;
    }
  | {
      type: ActionType.reset;
    };

function dbReducer(
  state: Partial<DatabaseObject> | null,
  action: DBReducerActionType,
): Partial<DatabaseObject> | null {
  const trimmedState = {
    ...(state || {}),
    database_name: state?.database_name?.trim() || '',
    sqlalchemy_uri: state?.sqlalchemy_uri || '',
  };

  switch (action.type) {
    case ActionType.inputChange:
      if (action.payload.type === 'checkbox') {
        return {
          ...trimmedState,
          [action.payload.name]: action.payload.checked,
        };
      }
      return {
        ...trimmedState,
        [action.payload.name]: action.payload.value,
      };
    case ActionType.editorChange:
      return {
        ...trimmedState,
        [action.payload.name]: action.payload.json,
      };
    case ActionType.textChange:
      return {
        ...trimmedState,
        [action.payload.name]: action.payload.value,
      };
    case ActionType.initialLoad:
    case ActionType.fetched:
      return {
        ...trimmedState,
        ...action.payload,
      };
    case ActionType.reset:
    default:
      return {};
  }
}

const DEFAULT_TAB_KEY = '1';

const StyledDBModal = styled(StyledModal)`
  .ant-alert {
    color: #325d7e;
    border: 1px solid #66bcfe;
    font-size: 13px;
    padding: 15px;
    margin: ${({ theme }) => theme.gridUnit * 4}px;
  }
  .ant-alert-message {
    color: #325d7e;
    font-weight: bold;
  }
  .ant-modal-body {
    padding-top: 0;
  }
`;

const EditHeader = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: ${({ theme }) => theme.gridUnit * 1}px;
  margin: ${({ theme }) => theme.gridUnit * 4}px
    ${({ theme }) => theme.gridUnit * 4}px
    ${({ theme }) => theme.gridUnit * 9}px;
`;

const CreateHeader = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: ${({ theme }) => theme.gridUnit * 1}px;
  margin: ${({ theme }) => theme.gridUnit * 4}px
    ${({ theme }) => theme.gridUnit * 4}px
    ${({ theme }) => theme.gridUnit * 9}px;
`;

const CreateHeaderTitle = styled.div`
  color: ${({ theme }) => theme.colors.grayscale.dark1} !important;
  font-weight: bold;
  font-size: ${({ theme }) => theme.typography.sizes.l}px;
  padding: ${({ theme }) => theme.gridUnit * 1}px;
`;

const CreateHeaderSubtitle = styled.div`
  color: ${({ theme }) => theme.colors.grayscale.dark1} !important;
  font-size: ${({ theme }) => theme.typography.sizes.s}px;
  padding: ${({ theme }) => theme.gridUnit * 1}px;
`;

const EditHeaderTitle = styled.div`
  color: ${({ theme }) => theme.colors.grayscale.light1} !important;
  font-size: ${({ theme }) => theme.typography.sizes.s}px;
  text-transform: uppercase;
`;

const EditHeaderSubtitle = styled.div`
  color: ${({ theme }) => theme.colors.grayscale.dark1} !important;
  font-size: ${({ theme }) => theme.typography.sizes.xl}px;
  font-weight: bold;
`;

const DatabaseModal: FunctionComponent<DatabaseModalProps> = ({
  addDangerToast,
  addSuccessToast,
  onDatabaseAdd,
  onHide,
  show,
  database = null,
}) => {
  const [db, setDB] = useReducer<
    Reducer<Partial<DatabaseObject> | null, DBReducerActionType>
  >(dbReducer, database);
  const [tabKey, setTabKey] = useState<string>(DEFAULT_TAB_KEY);
  const conf = useCommonConf();

  const isEditMode = database !== null;
  const useSqlAlchemyForm = true; // TODO: set up logic
  const hasConnectedDb = false; // TODO: set up logic

  // Database fetch logic
  const {
    state: { loading: dbLoading, resource: dbFetched },
    fetchResource,
    createResource,
    updateResource,
  } = useSingleViewResource<DatabaseObject>(
    'database',
    t('database'),
    addDangerToast,
  );

  // Test Connection logic
  const testConnection = () => {
    if (!db?.sqlalchemy_uri) {
      addDangerToast(t('Please enter a SQLAlchemy URI to test'));
      return;
    }

    const connection = {
      sqlalchemy_uri: db?.sqlalchemy_uri || '',
      database_name: db?.database_name?.trim() || undefined,
      impersonate_user: db?.impersonate_user || undefined,
      extra: db?.extra || undefined,
      encrypted_extra: db?.encrypted_extra || undefined,
      server_cert: db?.server_cert || undefined,
    };

    testDatabaseConnection(connection, addDangerToast, addSuccessToast);
  };

  const onClose = () => {
    setDB({ type: ActionType.reset });
    onHide();
  };

  const onSave = () => {
    if (isEditMode) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...update }: DatabaseObject = { ...(db as DatabaseObject) };

      if (db?.id) {
        updateResource(db.id, update).then(result => {
          if (result) {
            if (onDatabaseAdd) {
              onDatabaseAdd();
            }
            onClose();
          }
        });
      }
    } else if (db) {
      // Create
      db.database_name = db?.database_name?.trim();
      createResource(db as DatabaseObject).then(dbId => {
        if (dbId) {
          if (onDatabaseAdd) {
            onDatabaseAdd();
          }
          onClose();
        }
      });
    }
  };

  const disableSave = !(db?.database_name?.trim() && db?.sqlalchemy_uri);

  const onChange = (type: any, payload: any) => {
    setDB({ type, payload } as DBReducerActionType);
  };

  // Initialize
  const fetchDB = () => {
    if (isEditMode && database?.id) {
      if (!dbLoading) {
        const id = database.id || 0;

        fetchResource(id).catch(e =>
          addDangerToast(
            t(
              'Sorry there was an error fetching database information: %s',
              e.message,
            ),
          ),
        );
      }
    }
  };

  useEffect(() => {
    if (database) {
      setDB({
        type: ActionType.initialLoad,
        payload: database,
      });
    }
    if (show) {
      setTabKey(DEFAULT_TAB_KEY);
    }
    if (database && show) {
      fetchDB();
    }
  }, [show, database]);

  useEffect(() => {
    // TODO: can we include these values in the original fetch?
    if (dbFetched) {
      const {
        extra,
        impersonate_user,
        server_cert,
        sqlalchemy_uri,
      } = dbFetched;
      setDB({
        type: ActionType.fetched,
        payload: {
          extra,
          impersonate_user,
          server_cert,
          sqlalchemy_uri,
        },
      });
    }
  }, [dbFetched]);

  const tabChange = (key: string) => {
    setTabKey(key);
  };

  return isEditMode || useSqlAlchemyForm ? (
    <StyledDBModal
      name="database"
      className="database-modal"
      disablePrimaryButton={disableSave}
      height="600px"
      onHandledPrimaryAction={onSave}
      onHide={onClose}
      primaryButtonName={isEditMode ? t('Save') : t('Connect')}
      width="500px"
      show={show}
      title={
        <h4>{isEditMode ? t('Edit database') : t('Connect a database')}</h4>
      }
    >
      {!isEditMode && (
        <CreateHeader>
          <CreateHeaderTitle>Enter Primary Credentials</CreateHeaderTitle>
          <CreateHeaderSubtitle>
            Need help? Learn how to connect your database{' '}
            <a href="https://superset.apache.org/docs/databases/installing-database-drivers">
              here
            </a>
            .
          </CreateHeaderSubtitle>
        </CreateHeader>
      )}
      {isEditMode && (
        <EditHeader>
          <EditHeaderTitle>{database?.backend}</EditHeaderTitle>
          <EditHeaderSubtitle>{database?.database_name}</EditHeaderSubtitle>
        </EditHeader>
      )}
      <Tabs
        defaultActiveKey={DEFAULT_TAB_KEY}
        activeKey={tabKey}
        onTabClick={tabChange}
      >
        <StyledBasicTab tab={<span>{t('Basic')}</span>} key="1">
          {useSqlAlchemyForm ? (
            <SqlAlchemyForm
              db={db as DatabaseObject}
              onInputChange={({ target }: { target: HTMLInputElement }) =>
                onChange(ActionType.inputChange, {
                  type: target.type,
                  name: target.name,
                  checked: target.checked,
                  value: target.value,
                })
              }
              conf={conf}
              testConnection={testConnection}
            />
          ) : (
            <div>
              <p>TODO: db form</p>
            </div>
          )}
        </StyledBasicTab>
        <Tabs.TabPane tab={<span>{t('Advanced')}</span>} key="2">
          <ExtraOptions
            db={db as DatabaseObject}
            onInputChange={({ target }: { target: HTMLInputElement }) =>
              onChange(ActionType.inputChange, {
                type: target.type,
                name: target.name,
                checked: target.checked,
                value: target.value,
              })
            }
            onTextChange={({ target }: { target: HTMLTextAreaElement }) =>
              onChange(ActionType.textChange, {
                name: target.name,
                value: target.value,
              })
            }
            onEditorChange={(payload: { name: string; json: any }) =>
              onChange(ActionType.editorChange, payload)
            }
          />
        </Tabs.TabPane>
      </Tabs>
      <Alert
        message="Additional fields may be required"
        description="Select databases require additional fields to be completed in the next step to successfully connect the database. Learn what requirements your databases has here"
        type="info"
        showIcon
      />
    </StyledDBModal>
  ) : (
    <StyledDBModal
      name="database"
      className="database-modal"
      disablePrimaryButton={disableSave}
      height="600px"
      onHandledPrimaryAction={onSave}
      onHide={onClose}
      primaryButtonName={hasConnectedDb ? t('Connect') : t('Finish')}
      width="500px"
      show={show}
      title={<h4>{t('Connect a database')}</h4>}
    >
      <div>
        <p>TODO: db form</p>
      </div>
    </StyledDBModal>
  );
};

export default withToasts(DatabaseModal);
