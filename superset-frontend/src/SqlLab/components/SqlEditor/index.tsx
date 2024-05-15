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
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  ChangeEvent,
} from 'react';
import type AceEditor from 'react-ace';
import useEffectEvent from 'src/hooks/useEffectEvent';
import { CSSTransition } from 'react-transition-group';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import Split from 'react-split';
import {
  css,
  FeatureFlag,
  isFeatureEnabled,
  styled,
  t,
  useTheme,
  getExtensionsRegistry,
  QueryResponse,
  Query,
} from '@superset-ui/core';
import type {
  QueryEditor,
  SqlLabRootState,
  CursorPosition,
  Table,
} from 'src/SqlLab/types';
import type { DatabaseObject } from 'src/features/databases/types';
import { debounce, throttle, isBoolean, isEmpty } from 'lodash';
import Modal from 'src/components/Modal';
import Mousetrap from 'mousetrap';
import Button from 'src/components/Button';
import Timer from 'src/components/Timer';
import ResizableSidebar from 'src/components/ResizableSidebar';
import { AntdDropdown, AntdSwitch, Skeleton } from 'src/components';
import { Input, InputNumber } from 'src/components/Input';
import { Row, Col } from 'src/components';
import Slider from 'src/components/Slider';
import { Menu } from 'src/components/Menu';
import Icons from 'src/components/Icons';
import { detectOS } from 'src/utils/common';
import {
  addNewQueryEditor,
  CtasEnum,
  estimateQueryCost,
  persistEditorHeight,
  postStopQuery,
  queryEditorSetAutorun,
  queryEditorSetSql,
  queryEditorSetCursorPosition,
  queryEditorSetAndSaveSql,
  queryEditorSetTemplateParams,
  runQueryFromSqlEditor,
  saveQuery,
  addSavedQueryToTabState,
  scheduleQuery,
  setActiveSouthPaneTab,
  updateSavedQuery,
  formatQuery,
  switchQueryEditor,
  nl_to_sql,
} from 'src/SqlLab/actions/sqlLab';
import {
  STATE_TYPE_MAP,
  SQL_EDITOR_GUTTER_HEIGHT,
  SQL_EDITOR_GUTTER_MARGIN,
  SQL_TOOLBAR_HEIGHT,
  SQL_EDITOR_LEFTBAR_WIDTH,
  SQL_EDITOR_PADDING,
  INITIAL_NORTH_PERCENT,
  INITIAL_SOUTH_PERCENT,
  SET_QUERY_EDITOR_SQL_DEBOUNCE_MS,
  WINDOW_RESIZE_THROTTLE_MS,
} from 'src/SqlLab/constants';
import {
  getItem,
  LocalStorageKeys,
  setItem,
} from 'src/utils/localStorageHelpers';
import { EmptyStateBig } from 'src/components/EmptyState';
import getBootstrapData from 'src/utils/getBootstrapData';
import TemplateParamsEditor from '../TemplateParamsEditor';
import SouthPane from '../SouthPane';
import SaveQuery, { QueryPayload } from '../SaveQuery';
import ScheduleQueryButton from '../ScheduleQueryButton';
import EstimateQueryCostButton from '../EstimateQueryCostButton';
import ShareSqlLabQuery from '../ShareSqlLabQuery';
import SqlEditorLeftBar from '../SqlEditorLeftBar';
import AceEditorWrapper from '../AceEditorWrapper';
import RunQueryActionButton from '../RunQueryActionButton';
import QueryLimitSelect from '../QueryLimitSelect';
import KeyboardShortcutButton, {
  KEY_MAP,
  KeyboardShortcut,
} from '../KeyboardShortcutButton';

const bootstrapData = getBootstrapData();
const scheduledQueriesConf = bootstrapData?.common?.conf?.SCHEDULED_QUERIES;

const StyledToolbar = styled.div`
  padding: ${({ theme }) => theme.gridUnit * 2}px;
  background: ${({ theme }) => theme.colors.grayscale.light5};
  display: flex;
  justify-content: space-between;
  border: 1px solid ${({ theme }) => theme.colors.grayscale.light2};
  border-top: 0;
  column-gap: ${({ theme }) => theme.gridUnit}px;

  form {
    margin-block-end: 0;
  }

  .leftItems,
  .rightItems {
    display: flex;
    align-items: center;
    & > span {
      margin-right: ${({ theme }) => theme.gridUnit * 2}px;
      display: inline-block;

      &:last-child {
        margin-right: 0;
      }
    }
  }

  .limitDropdown {
    white-space: nowrap;
  }
`;

const StyledSidebar = styled.div<{ width: number; hide: boolean | undefined }>`
  flex: 0 0 ${({ width }) => width}px;
  width: ${({ width }) => width}px;
  padding: ${({ theme, hide }) => (hide ? 0 : theme.gridUnit * 2.5)}px;
  border-right: 1px solid
    ${({ theme, hide }) =>
      hide ? 'transparent' : theme.colors.grayscale.light2};
`;

const StyledSqlEditor = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: row;
    height: 100%;

    .schemaPane {
      transition: transform ${theme.transitionTiming}s ease-in-out;
    }

    .queryPane {
      flex: 1 1 auto;
      padding: ${theme.gridUnit * 2}px;
      overflow-y: auto;
      overflow-x: scroll;
    }

    .schemaPane-enter-done,
    .schemaPane-exit {
      transform: translateX(0);
      z-index: 7;
    }

    .schemaPane-exit-active {
      transform: translateX(-120%);
    }

    .schemaPane-enter-active {
      transform: translateX(0);
      max-width: ${theme.gridUnit * 75}px;
    }

    .schemaPane-enter,
    .schemaPane-exit-done {
      max-width: 0;
      transform: translateX(-120%);
      overflow: hidden;
    }

    .schemaPane-exit-done + .queryPane {
      margin-left: 0;
    }

    .gutter {
      border-top: 1px solid ${theme.colors.grayscale.light2};
      border-bottom: 1px solid ${theme.colors.grayscale.light2};
      width: 3%;
      margin: ${SQL_EDITOR_GUTTER_MARGIN}px 47%;
    }

    .gutter.gutter-vertical {
      cursor: row-resize;
    }
  `}
`;

const extensionsRegistry = getExtensionsRegistry();

export type Props = {
  queryEditor: QueryEditor;
  defaultQueryLimit: number;
  maxRow: number;
  displayLimit: number;
  saveQueryWarning: string | null;
  scheduleQueryWarning: string | null;
};

const elementStyle = (
  dimension: string,
  elementSize: number,
  gutterSize: number,
) => ({
  [dimension]: `calc(${elementSize}% - ${
    gutterSize + SQL_EDITOR_GUTTER_MARGIN
  }px)`,
});

const SqlEditor: React.FC<Props> = ({
  queryEditor,
  defaultQueryLimit,
  maxRow,
  displayLimit,
  saveQueryWarning,
  scheduleQueryWarning,
}) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const enable_sql_llm = isFeatureEnabled(FeatureFlag.Superset_llm_enable);

  const [temperature, setTemperature] = useState(0.9);
  const handleTemperatureChange = newValue => {
    setTemperature(newValue as number);
  };

  const [maxTokens, setMaxTokens] = useState(500);
  const handleMaxTokensChange = newValue => {
    setMaxTokens(newValue as number);
  };

  const [topK, setTopK] = useState(40);
  const handleTopKChange = newValue => {
    setTopK(newValue as number);
  };

  const [topP, setTopP] = useState(0.8);
  const handleTopPChange = newValue => {
    setTopP(newValue as number);
  };

  const [typicalP, setTypicalP] = useState(0.9);
  const handleTypicalPChange = newValue => {
    setTypicalP(newValue as number);
  };

  const [repetitionPenalty, setRepetitionPenalty] = useState(1.18);
  const handleRepetitionPenaltyChange = newValue => {
    setRepetitionPenalty(newValue as number);
  };

  const { database, latestQuery, hideLeftBar, currentQueryEditorId } =
    useSelector<
      SqlLabRootState,
      {
        database?: DatabaseObject;
        latestQuery?: QueryResponse;
        hideLeftBar?: boolean;
        currentQueryEditorId: QueryEditor['id'];
      }
    >(({ sqlLab: { unsavedQueryEditor, databases, queries, tabHistory } }) => {
      let { dbId, latestQueryId, hideLeftBar } = queryEditor;
      if (unsavedQueryEditor?.id === queryEditor.id) {
        dbId = unsavedQueryEditor.dbId || dbId;
        latestQueryId = unsavedQueryEditor.latestQueryId || latestQueryId;
        hideLeftBar = isBoolean(unsavedQueryEditor.hideLeftBar)
          ? unsavedQueryEditor.hideLeftBar
          : hideLeftBar;
      }
      return {
        database: databases[dbId || ''],
        latestQuery: queries[latestQueryId || ''],
        hideLeftBar,
        currentQueryEditorId: tabHistory.slice(-1)[0],
      };
    }, shallowEqual);

  const isActive = currentQueryEditorId === queryEditor.id;
  const [height, setHeight] = useState(0);
  const [autorun, setAutorun] = useState(queryEditor.autorun);
  const [ctas, setCtas] = useState('');
  const [northPercent, setNorthPercent] = useState(
    queryEditor.northPercent || INITIAL_NORTH_PERCENT,
  );
  const [southPercent, setSouthPercent] = useState(
    queryEditor.southPercent || INITIAL_SOUTH_PERCENT,
  );
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(
    getItem(LocalStorageKeys.SqllabIsAutocompleteEnabled, true),
  );
  const [showCreateAsModal, setShowCreateAsModal] = useState(false);
  const [showLLMConfigurationModal, setshowLLMConfigurationModal] =
    useState(false);
  const [createAs, setCreateAs] = useState('');
  const [showEmptyState, setShowEmptyState] = useState(false);

  const sqlEditorRef = useRef<HTMLDivElement>(null);
  const northPaneRef = useRef<HTMLDivElement>(null);

  const SqlFormExtension = extensionsRegistry.get('sqleditor.extension.form');

  const startQuery = useCallback(
    (ctasArg = false, ctas_method = CtasEnum.Table) => {
      if (!database) {
        return;
      }
      var nltext = '';
      if (enable_sql_llm)
        nltext = (document.getElementById('nlsql') as HTMLInputElement).value;

      dispatch(
        runQueryFromSqlEditor(
          database,
          queryEditor,
          defaultQueryLimit,
          ctasArg ? ctas : '',
          ctasArg,
          ctas_method,
          nltext,
        ),
      );
      dispatch(setActiveSouthPaneTab('Results'));
    },
    [ctas, database, defaultQueryLimit, dispatch, queryEditor],
  );

  const formatCurrentQuery = useCallback(() => {
    dispatch(formatQuery(queryEditor));
  }, [dispatch, queryEditor]);

  const stopQuery = useCallback(() => {
    if (latestQuery && ['running', 'pending'].indexOf(latestQuery.state) >= 0) {
      dispatch(postStopQuery(latestQuery));
    }
    return false;
  }, [dispatch, latestQuery]);

  const runQuery = () => {
    if (database) {
      startQuery();
    }
  };

  useEffect(() => {
    if (autorun) {
      setAutorun(false);
      dispatch(queryEditorSetAutorun(queryEditor, false));
      startQuery();
    }
  }, [autorun, dispatch, queryEditor, startQuery]);

  // One layer of abstraction for easy spying in unit tests
  const getSqlEditorHeight = () =>
    sqlEditorRef.current
      ? sqlEditorRef.current.clientHeight - SQL_EDITOR_PADDING * 2
      : 0;

  const getHotkeyConfig = useCallback(() => {
    // Get the user's OS
    const userOS = detectOS();
    return [
      {
        name: 'runQuery1',
        key: KeyboardShortcut.CtrlR,
        descr: KEY_MAP[KeyboardShortcut.CtrlR],
        func: () => {
          if (queryEditor.sql.trim() !== '') {
            startQuery();
          }
        },
      },
      {
        name: 'runQuery2',
        key: KeyboardShortcut.CtrlEnter,
        descr: KEY_MAP[KeyboardShortcut.CtrlEnter],
        func: () => {
          if (queryEditor.sql.trim() !== '') {
            startQuery();
          }
        },
      },
      {
        name: 'newTab',
        ...(userOS === 'Windows'
          ? {
              key: KeyboardShortcut.CtrlQ,
              descr: KEY_MAP[KeyboardShortcut.CtrlQ],
            }
          : {
              key: KeyboardShortcut.CtrlT,
              descr: KEY_MAP[KeyboardShortcut.CtrlT],
            }),
        func: () => {
          dispatch(addNewQueryEditor());
        },
      },
      {
        name: 'stopQuery',
        ...(userOS === 'MacOS'
          ? {
              key: KeyboardShortcut.CtrlX,
              descr: KEY_MAP[KeyboardShortcut.CtrlX],
            }
          : {
              key: KeyboardShortcut.CtrlE,
              descr: KEY_MAP[KeyboardShortcut.CtrlE],
            }),
        func: stopQuery,
      },
      {
        name: 'formatQuery',
        key: KeyboardShortcut.CtrlShiftF,
        descr: KEY_MAP[KeyboardShortcut.CtrlShiftF],
        func: () => {
          formatCurrentQuery();
        },
      },
    ];
  }, [dispatch, queryEditor.sql, startQuery, stopQuery, formatCurrentQuery]);

  const hotkeys = useMemo(() => {
    // Get all hotkeys including ace editor hotkeys
    // Get the user's OS
    const userOS = detectOS();
    const base = [
      ...getHotkeyConfig(),
      {
        name: 'runQuery3',
        key: KeyboardShortcut.CtrlShiftEnter,
        descr: KEY_MAP[KeyboardShortcut.CtrlShiftEnter],
        func: (editor: AceEditor['editor']) => {
          if (!editor.getValue().trim()) {
            return;
          }
          const session = editor.getSession();
          const cursorPosition = editor.getCursorPosition();
          const totalLine = session.getLength();
          const currentRow = editor.getFirstVisibleRow();
          let end = editor.find(';', {
            backwards: false,
            skipCurrent: true,
          })?.end;
          if (!end || end.row < cursorPosition.row) {
            end = {
              row: totalLine + 1,
              column: 0,
            };
          }
          let start = editor.find(';', {
            backwards: true,
            skipCurrent: true,
          })?.end;
          let currentLine = start?.row;
          if (
            !currentLine ||
            currentLine > cursorPosition.row ||
            (currentLine === cursorPosition.row &&
              (start?.column || 0) > cursorPosition.column)
          ) {
            currentLine = 0;
          }
          let content =
            currentLine === start?.row
              ? session.getLine(currentLine).slice(start.column).trim()
              : session.getLine(currentLine).trim();
          while (!content && currentLine < totalLine) {
            currentLine += 1;
            content = session.getLine(currentLine).trim();
          }
          if (currentLine !== start?.row) {
            start = { row: currentLine, column: 0 };
          }
          editor.selection.setSelectionRange({
            start: start ?? { row: 0, column: 0 },
            end,
          });
          startQuery();
          editor.selection.clearSelection();
          editor.moveCursorToPosition(cursorPosition);
          editor.scrollToRow(currentRow);
        },
      },
    ];
    if (userOS === 'MacOS') {
      base.push({
        name: 'previousLine',
        key: KeyboardShortcut.CtrlP,
        descr: KEY_MAP[KeyboardShortcut.CtrlP],
        func: editor => {
          editor.navigateUp();
        },
      });
    }

    return base;
  }, [getHotkeyConfig, startQuery]);

  const onBeforeUnload = useEffectEvent(event => {
    if (
      database?.extra_json?.cancel_query_on_windows_unload &&
      latestQuery?.state === 'running'
    ) {
      event.preventDefault();
      stopQuery();
    }
  });

  const shouldLoadQueryEditor =
    isFeatureEnabled(FeatureFlag.SqllabBackendPersistence) &&
    !queryEditor.loaded;

  const loadQueryEditor = useEffectEvent(() => {
    if (shouldLoadQueryEditor) {
      dispatch(switchQueryEditor(queryEditor, displayLimit));
    }
  });

  useEffect(() => {
    // We need to measure the height of the sql editor post render to figure the height of
    // the south pane so it gets rendered properly
    setHeight(getSqlEditorHeight());
    const handleWindowResizeWithThrottle = throttle(
      () => setHeight(getSqlEditorHeight()),
      WINDOW_RESIZE_THROTTLE_MS,
    );
    if (isActive) {
      loadQueryEditor();
      window.addEventListener('resize', handleWindowResizeWithThrottle);
      window.addEventListener('beforeunload', onBeforeUnload);
    }

    return () => {
      window.removeEventListener('resize', handleWindowResizeWithThrottle);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
    // TODO: Remove useEffectEvent deps once https://github.com/facebook/react/pull/25881 is released
  }, [onBeforeUnload, loadQueryEditor, isActive]);

  useEffect(() => {
    if (!database || isEmpty(database)) {
      setShowEmptyState(true);
    }
  }, [database]);

  useEffect(() => {
    // setup hotkeys
    const hotkeys = getHotkeyConfig();
    if (isActive) {
      // MouseTrap always override the same key
      // Unbind (reset) will be called when App component unmount
      hotkeys.forEach(keyConfig => {
        Mousetrap.bind([keyConfig.key], keyConfig.func);
      });
    }
  }, [getHotkeyConfig, latestQuery, isActive]);

  const onResizeStart = () => {
    // Set the heights on the ace editor and the ace content area after drag starts
    // to smooth out the visual transition to the new heights when drag ends
    const editorEl = document.getElementsByClassName(
      'ace_content',
    )[0] as HTMLElement;
    if (editorEl) {
      editorEl.style.height = '100%';
    }
  };

  const onResizeEnd = ([northPercent, southPercent]: number[]) => {
    setNorthPercent(northPercent);
    setSouthPercent(southPercent);

    if (northPaneRef.current?.clientHeight) {
      dispatch(persistEditorHeight(queryEditor, northPercent, southPercent));
    }
  };

  const setQueryEditorAndSaveSql = useCallback(
    sql => {
      dispatch(queryEditorSetAndSaveSql(queryEditor, sql));
    },
    [dispatch, queryEditor],
  );

  const setQueryEditorAndSaveSqlWithDebounce = useMemo(
    () => debounce(setQueryEditorAndSaveSql, SET_QUERY_EDITOR_SQL_DEBOUNCE_MS),
    [setQueryEditorAndSaveSql],
  );

  const onSqlChanged = useEffectEvent((sql: string) => {
    dispatch(queryEditorSetSql(queryEditor, sql));
  });

  // Return the heights for the ace editor and the south pane as an object
  // given the height of the sql editor, north pane percent and south pane percent.
  const getAceEditorAndSouthPaneHeights = (
    height: number,
    northPercent: number,
    southPercent: number,
  ) => ({
    aceEditorHeight:
      (height * northPercent) / (theme.gridUnit * 25) -
      (SQL_EDITOR_GUTTER_HEIGHT / 2 + SQL_EDITOR_GUTTER_MARGIN) -
      SQL_TOOLBAR_HEIGHT,
    southPaneHeight:
      (height * southPercent) / (theme.gridUnit * 25) -
      (SQL_EDITOR_GUTTER_HEIGHT / 2 + SQL_EDITOR_GUTTER_MARGIN),
  });

  const getQueryCostEstimate = () => {
    if (database) {
      dispatch(estimateQueryCost(queryEditor));
    }
  };

  const handleToggleAutocompleteEnabled = () => {
    setItem(LocalStorageKeys.SqllabIsAutocompleteEnabled, !autocompleteEnabled);
    setAutocompleteEnabled(!autocompleteEnabled);
  };

  const createTableAs = () => {
    startQuery(true, CtasEnum.Table);
    setShowCreateAsModal(false);
    setCtas('');
  };

  const createViewAs = () => {
    startQuery(true, CtasEnum.View);
    setShowCreateAsModal(false);
    setCtas('');
  };

  const ctasChanged = (event: ChangeEvent<HTMLInputElement>) => {
    setCtas(event.target.value);
  };

  const renderDropdown = () => {
    const qe = queryEditor;
    const successful = latestQuery?.state === 'success';
    const scheduleToolTip = successful
      ? t('Schedule the query periodically')
      : t('You must run the query successfully first');
    return (
      <Menu css={{ width: theme.gridUnit * 50 }}>
        <Menu.Item css={{ display: 'flex', justifyContent: 'space-between' }}>
          {' '}
          <span>{t('Autocomplete')}</span>{' '}
          <AntdSwitch
            checked={autocompleteEnabled}
            onChange={handleToggleAutocompleteEnabled}
          />{' '}
        </Menu.Item>
        {isFeatureEnabled(FeatureFlag.EnableTemplateProcessing) && (
          <Menu.Item>
            <TemplateParamsEditor
              language="json"
              onChange={params => {
                dispatch(queryEditorSetTemplateParams(qe, params));
              }}
              queryEditorId={qe.id}
            />
          </Menu.Item>
        )}
        <Menu.Item onClick={formatCurrentQuery}>{t('Format SQL')}</Menu.Item>
        {!isEmpty(scheduledQueriesConf) && (
          <Menu.Item>
            <ScheduleQueryButton
              defaultLabel={qe.name}
              sql={qe.sql}
              onSchedule={(query: Query) => dispatch(scheduleQuery(query))}
              schema={qe.schema}
              dbId={qe.dbId}
              scheduleQueryWarning={scheduleQueryWarning}
              tooltip={scheduleToolTip}
              disabled={!successful}
            />
          </Menu.Item>
        )}
        <Menu.Item>
          <KeyboardShortcutButton>
            {t('Keyboard shortcuts')}
          </KeyboardShortcutButton>
        </Menu.Item>
      </Menu>
    );
  };

  const onSaveQuery = async (query: QueryPayload, clientId: string) => {
    const savedQuery = await dispatch(saveQuery(query, clientId));
    dispatch(addSavedQueryToTabState(queryEditor, savedQuery));
  };

  const renderEditorBottomBar = () => {
    const { allow_ctas: allowCTAS, allow_cvas: allowCVAS } = database || {};

    const showMenu = allowCTAS || allowCVAS;
    const runMenuBtn = (
      <Menu>
        {allowCTAS && (
          <Menu.Item
            onClick={() => {
              setShowCreateAsModal(true);
              setCreateAs(CtasEnum.Table);
            }}
            key="1"
          >
            {t('CREATE TABLE AS')}
          </Menu.Item>
        )}
        {allowCVAS && (
          <Menu.Item
            onClick={() => {
              setShowCreateAsModal(true);
              setCreateAs(CtasEnum.View);
            }}
            key="2"
          >
            {t('CREATE VIEW AS')}
          </Menu.Item>
        )}
      </Menu>
    );

    return (
      <StyledToolbar className="sql-toolbar" id="js-sql-toolbar">
        <div className="leftItems">
          <span>
            <RunQueryActionButton
              allowAsync={database?.allow_run_async === true}
              queryEditorId={queryEditor.id}
              queryState={latestQuery?.state}
              runQuery={runQuery}
              stopQuery={stopQuery}
              overlayCreateAsMenu={showMenu ? runMenuBtn : null}
            />
          </span>
          {isFeatureEnabled(FeatureFlag.EstimateQueryCost) &&
            database?.allows_cost_estimate && (
              <span>
                <EstimateQueryCostButton
                  getEstimate={getQueryCostEstimate}
                  queryEditorId={queryEditor.id}
                  tooltip={t('Estimate the cost before running a query')}
                />
              </span>
            )}
          <span>
            <QueryLimitSelect
              queryEditorId={queryEditor.id}
              maxRow={maxRow}
              defaultQueryLimit={defaultQueryLimit}
            />
          </span>
          {latestQuery && (
            <Timer
              startTime={latestQuery.startDttm}
              endTime={latestQuery.endDttm}
              status={STATE_TYPE_MAP[latestQuery.state]}
              isRunning={latestQuery.state === 'running'}
            />
          )}
        </div>
        <div className="rightItems">
          <span>
            <SaveQuery
              queryEditorId={queryEditor.id}
              columns={latestQuery?.results?.columns || []}
              onSave={onSaveQuery}
              onUpdate={(query, remoteId) =>
                dispatch(updateSavedQuery(query, remoteId))
              }
              saveQueryWarning={saveQueryWarning}
              database={database}
            />
          </span>
          <span>
            <ShareSqlLabQuery queryEditorId={queryEditor.id} />
          </span>
          <AntdDropdown overlay={renderDropdown()} trigger={['click']}>
            <Icons.MoreHoriz iconColor={theme.colors.grayscale.base} />
          </AntdDropdown>
        </div>
      </StyledToolbar>
    );
  };

  const handleCursorPositionChange = (newPosition: CursorPosition) => {
    dispatch(queryEditorSetCursorPosition(queryEditor, newPosition));
  };

  const queryPane = () => {
    const { aceEditorHeight, southPaneHeight } =
      getAceEditorAndSouthPaneHeights(height, northPercent, southPercent);

    const tables = useSelector<SqlLabRootState, Table[]>(
      ({ sqlLab }) =>
        sqlLab.tables.filter(table => table.queryEditorId === queryEditor.id),
      shallowEqual,
    );

    const update_sql_by_nl = async () => {
      const inputElement = document.getElementById('nlsql') as HTMLInputElement;

      let columns = [];
      let table_names = [];
      console.log(tables);
      for (let i = 0; i < tables.length; i++) {
        if (
          tables[i]['persistData'] !== null &&
          tables[i]['persistData']['columns'] !== null
        ) {
          columns.push(tables[i]['persistData']['columns']);
          table_names.push(tables[i]['name']);
        }
      }

      var names = [];
      var types = [];

      for (let i = 0; i < columns.length; i++) {
        let name = [];
        let type = [];
        for (let j = 0; j < columns[i].length; j++) {
          name.push(columns[i][j]['name']);
          type.push(columns[i][j]['type']);
        }
        names.push(name);
        types.push(type);
      }
      // let columns
      // if(tables[0]!=null && tables[0]['persistData']!==null && tables[0]['persistData']['columns']!==null){
      //   columns = tables[0]['persistData']['columns']
      // }
      // var names = []
      // var types = []
      // for(let i=0; i<columns.length; i++){
      //   names.push(columns[i]['name'])
      //   types.push(columns[i]['type'])
      // }

      const sql_value = await nl_to_sql(
        inputElement.value,
        table_names,
        names,
        types,
      );
      onSqlChanged(sql_value);
    };

    return (
      <Split
        expandToMin
        className="queryPane"
        sizes={[northPercent, southPercent]}
        elementStyle={elementStyle}
        minSize={200}
        direction="vertical"
        gutterSize={SQL_EDITOR_GUTTER_HEIGHT}
        onDragStart={onResizeStart}
        onDragEnd={onResizeEnd}
      >
        <div ref={northPaneRef} className="north-pane">
          {SqlFormExtension && (
            <SqlFormExtension
              queryEditorId={queryEditor.id}
              setQueryEditorAndSaveSqlWithDebounce={
                setQueryEditorAndSaveSqlWithDebounce
              }
              startQuery={startQuery}
            />
          )}

          {enable_sql_llm && (
            <div style={{ marginBottom: '10px' }}>
              <Input
                id="nlsql"
                placeholder="Enter your natural language query..."
              />

              <Button
                style={{
                  width: '150px',
                  marginTop: '10px',
                }}
                buttonStyle="primary"
                onClick={() => {
                  setshowLLMConfigurationModal(true);
                }}
              >
                CONFIGURE
                <Icons.Gear
                  style={{
                    fontSize: '15px',
                  }}
                  name="gear"
                  iconColor={theme.colors.grayscale.light5}
                  data-test="filterbar-orientation-icon"
                />
              </Button>

              <Button
                style={{
                  width: '150px',
                  marginTop: '10px',
                }}
                buttonStyle="primary"
                onClick={update_sql_by_nl}
              >
                Generate SQL
              </Button>

              <Modal
                show={showLLMConfigurationModal}
                title={'LLM Configurations'}
                onHide={() => setshowLLMConfigurationModal(false)}
                footer={
                  <>
                    <Button onClick={() => setshowLLMConfigurationModal(false)}>
                      CANCEL
                    </Button>
                    <Button
                      buttonStyle="primary"
                      disabled={false}
                      onClick={() => setshowLLMConfigurationModal(false)}
                    >
                      SAVE
                    </Button>
                  </>
                }
                onHandledPrimaryAction={() =>
                  setshowLLMConfigurationModal(false)
                }
              >
                <div style={{ fontSize: '14px', color: 'grey' }}>
                  <div id="endpoint" style={{ marginBottom: '20px' }}>
                    <span>{'Endpoint'}</span>
                    <Input placeholder={'Enter endpoint'} />
                  </div>
                  <div id="temperature" style={{ marginBottom: '10px' }}>
                    <span>{'Temperature'}</span>
                    {/* <Input placeholder={'Enter Temperature'} /> */}
                    <Row>
                      <Col span={19}>
                        <Slider
                          step={0.01}
                          min={0.1}
                          max={2.0}
                          onChange={handleTemperatureChange}
                          value={
                            typeof temperature === 'number' ? temperature : 0
                          }
                        />
                      </Col>
                      <Col span={4}>
                        <InputNumber
                          step={0.01}
                          min={0.1}
                          max={2.0}
                          value={temperature}
                          onChange={handleTemperatureChange}
                          style={{
                            marginLeft: '25px',
                          }}
                        />
                      </Col>
                    </Row>
                  </div>

                  <div id="max_tokens" style={{ marginBottom: '10px' }}>
                    <span>{'Max Tokens'}</span>
                    {/* <Input placeholder={'Enter Max Tokens'} /> */}
                    <Row>
                      <Col span={19}>
                        <Slider
                          step={1}
                          min={50}
                          max={4000}
                          onChange={handleMaxTokensChange}
                          value={typeof maxTokens === 'number' ? maxTokens : 0}
                        />
                      </Col>
                      <Col span={4}>
                        <InputNumber
                          step={1}
                          min={50}
                          max={4000}
                          style={{
                            marginLeft: '25px',
                          }}
                          value={maxTokens}
                          onChange={handleMaxTokensChange}
                        />
                      </Col>
                    </Row>
                  </div>
                  <div id="top_k" style={{ marginBottom: '10px' }}>
                    <span>{'Top K'}</span>
                    {/* <Input placeholder={'Enter Top K'} /> */}
                    <Row>
                      <Col span={19}>
                        <Slider
                          step={1}
                          min={1}
                          max={200}
                          onChange={handleTopKChange}
                          value={typeof topK === 'number' ? topK : 0}
                        />
                      </Col>
                      <Col span={4}>
                        <InputNumber
                          min={1}
                          max={200}
                          style={{
                            marginLeft: '25px',
                          }}
                          step={1}
                          value={topK}
                          onChange={handleTopKChange}
                        />
                      </Col>
                    </Row>
                  </div>
                  <div id="top_p" style={{ marginBottom: '10px' }}>
                    <span>{'Top P'}</span>
                    {/* <Input placeholder={'Enter Top P'} /> */}
                    <Row>
                      <Col span={19}>
                        <Slider
                          step={0.01}
                          min={0.01}
                          max={0.99}
                          onChange={handleTopPChange}
                          value={typeof topP === 'number' ? topP : 0}
                        />
                      </Col>
                      <Col span={4}>
                        <InputNumber
                          min={0.01}
                          max={0.99}
                          style={{
                            marginLeft: '25px',
                          }}
                          step={0.01}
                          value={topP}
                          onChange={handleTopPChange}
                        />
                      </Col>
                    </Row>
                  </div>
                  <div id="typical_p" style={{ marginBottom: '10px' }}>
                    <span>{'Typical P'}</span>
                    {/* <Input placeholder={'Enter Typical P'} /> */}
                    <Row>
                      <Col span={19}>
                        <Slider
                          step={0.01}
                          min={0.01}
                          max={0.99}
                          defaultValue={0.9}
                          onChange={handleTypicalPChange}
                          value={typeof typicalP === 'number' ? typicalP : 0}
                        />
                      </Col>
                      <Col span={4}>
                        <InputNumber
                          min={0.01}
                          max={0.99}
                          style={{
                            marginLeft: '25px',
                          }}
                          step={0.01}
                          value={typicalP}
                          onChange={handleTypicalPChange}
                        />
                      </Col>
                    </Row>
                  </div>
                  <div id="repetition_penalty" style={{ marginBottom: '10px' }}>
                    <span>{'Repetition Penalty'}</span>
                    {/* <Input placeholder={'Enter Repetition Penalty'} /> */}
                    <Row>
                      <Col span={19}>
                        <Slider
                          step={0.1}
                          min={0.1}
                          max={50}
                          onChange={handleRepetitionPenaltyChange}
                          value={
                            typeof repetitionPenalty === 'number'
                              ? repetitionPenalty
                              : 0
                          }
                        />
                      </Col>
                      <Col span={4}>
                        <InputNumber
                          min={0.1}
                          max={50}
                          style={{
                            marginLeft: '25px',
                          }}
                          step={0.1}
                          value={repetitionPenalty}
                          onChange={handleRepetitionPenaltyChange}
                        />
                      </Col>
                    </Row>
                  </div>
                </div>
              </Modal>
            </div>
          )}

          <AceEditorWrapper
            autocomplete={autocompleteEnabled}
            onBlur={onSqlChanged}
            onChange={onSqlChanged}
            queryEditorId={queryEditor.id}
            onCursorPositionChange={handleCursorPositionChange}
            height={`${aceEditorHeight}px`}
            hotkeys={hotkeys}
          />
          {renderEditorBottomBar()}
        </div>
        <SouthPane
          queryEditorId={queryEditor.id}
          latestQueryId={latestQuery?.id}
          height={southPaneHeight}
          displayLimit={displayLimit}
          defaultQueryLimit={defaultQueryLimit}
        />
      </Split>
    );
  };

  const createViewModalTitle =
    createAs === CtasEnum.View ? 'CREATE VIEW AS' : 'CREATE TABLE AS';

  const createModalPlaceHolder =
    createAs === CtasEnum.View
      ? t('Specify name to CREATE VIEW AS schema in: public')
      : t('Specify name to CREATE TABLE AS schema in: public');

  const leftBarStateClass = hideLeftBar
    ? 'schemaPane-exit-done'
    : 'schemaPane-enter-done';
  return (
    <StyledSqlEditor ref={sqlEditorRef} className="SqlEditor">
      <CSSTransition classNames="schemaPane" in={!hideLeftBar} timeout={300}>
        <ResizableSidebar
          id={`sqllab:${queryEditor.id}`}
          minWidth={SQL_EDITOR_LEFTBAR_WIDTH}
          initialWidth={SQL_EDITOR_LEFTBAR_WIDTH}
          enable={!hideLeftBar}
        >
          {adjustedWidth => (
            <StyledSidebar
              className={`schemaPane ${leftBarStateClass}`}
              width={adjustedWidth}
              hide={hideLeftBar}
            >
              <SqlEditorLeftBar
                database={database}
                queryEditorId={queryEditor.id}
                setEmptyState={bool => setShowEmptyState(bool)}
              />
            </StyledSidebar>
          )}
        </ResizableSidebar>
      </CSSTransition>
      {shouldLoadQueryEditor ? (
        <div
          data-test="sqlEditor-loading"
          css={css`
            flex: 1;
            padding: ${theme.gridUnit * 4}px;
          `}
        >
          <Skeleton active />
        </div>
      ) : showEmptyState ? (
        <EmptyStateBig
          image="vector.svg"
          title={t('Select a database to write a query')}
          description={t(
            'Choose one of the available databases from the panel on the left.',
          )}
        />
      ) : (
        queryPane()
      )}
      <Modal
        show={showCreateAsModal}
        title={t(createViewModalTitle)}
        onHide={() => setShowCreateAsModal(false)}
        footer={
          <>
            <Button onClick={() => setShowCreateAsModal(false)}>
              {t('Cancel')}
            </Button>
            {createAs === CtasEnum.Table && (
              <Button
                buttonStyle="primary"
                disabled={ctas.length === 0}
                onClick={createTableAs}
              >
                {t('Create')}
              </Button>
            )}
            {createAs === CtasEnum.View && (
              <Button
                buttonStyle="primary"
                disabled={ctas.length === 0}
                onClick={createViewAs}
              >
                {t('Create')}
              </Button>
            )}
          </>
        }
      >
        <span>{t('Name')}</span>
        <Input placeholder={createModalPlaceHolder} onChange={ctasChanged} />
      </Modal>
    </StyledSqlEditor>
  );
};

export default SqlEditor;
