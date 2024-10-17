import { Opportunity } from '@modules/opportunities/entities/opportunity/opportunity.entity';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  useCallback, useEffect, useMemo, useState
} from 'react';
import { ClientsRoute, ClientDetailsRoute } from '@modules/clients/presentation/v1/routes';
import {
  CaseCreationSubmissionRootRoute,
  CaseCreationBankDocumentsRoute,
  CaseCreationBankFormsRoute,
  CaseCreationBasicInfoRoute,
  CaseCreationFillFormsRoute,
  CaseCreationSubmitApplicationsRoute,
  CaseCreationLayoutRoute,
  CaseCreationSelectBankProductsRoute
} from '@modules/opportunities/presentation/v2/routes';
import useVaultProgress from '@modules/vault/hooks/queries/useVaultProgress';
import { layoutRoute } from '@app/router/layout';
import { CasesRoute } from '@modules/opportunities/presentation/v1/routes';
import { BANK_APPLICATION_STATUS } from '@modules/opportunities/entities/bankApplication/const';
import useComputeCaseCreationState from './useComputeCaseCreationState';

export namespace CaseCreationEngine {
  export type StateMachineRoutes = typeof CaseCreationBasicInfoRoute | typeof CaseCreationBankDocumentsRoute |
  typeof CaseCreationBankFormsRoute | typeof CaseCreationSubmitApplicationsRoute |
  typeof CaseCreationSubmissionRootRoute | typeof CaseCreationFillFormsRoute | typeof CaseCreationSelectBankProductsRoute;
  export type StateMachine = Record<StateMachineRoutes['to'],
  {
    isAccessible: boolean;
    isComplete: boolean;
    isAgregateRoute?: boolean;
    isSkipped?: boolean;
    stateMetadata?: {
      completedSteps: number;
      totalSteps: number;
    };
  }>;
}

const useCaseCreationStateMachineEngine = ({
  isEnabled, opportunity, vaultProgress, hasSelectedBanks,
}: {
  opportunity?: Opportunity,
  vaultProgress?: ReturnType<typeof useVaultProgress>['data'],
  isEnabled?: boolean
  hasSelectedBanks: boolean,
// eslint-disable-next-line sonarjs/cognitive-complexity
}) => {
  const Route = CaseCreationLayoutRoute;
  const { opportunityId } = Route.useParams();
  const routerState = useRouterState();
  const navigate = useNavigate();
  const [latestStateIndex, setLatestStateIndex] = useState<number>(0);

  const { STATE_MACHINE } = useComputeCaseCreationState({ opportunity, vaultProgress, hasSelectedBanks });

  // Remove submission root route for internal routing as its an aggregate
  // So it doesn't mess up with how the progress calculation is computed
  // eslint-disable-next-line no-underscore-dangle

  const STATE_MACHINE_ROUTES = useMemo(() => Object.keys(STATE_MACHINE).filter((val) =>
    val !== CaseCreationSubmissionRootRoute.to
  && (STATE_MACHINE[val as keyof typeof STATE_MACHINE].isSkipped === undefined
    || !STATE_MACHINE[val as keyof typeof STATE_MACHINE].isSkipped
  )), [STATE_MACHINE]);

  const { '/case/$opportunityId/submission': _, ..._STATE_MACHINE } = STATE_MACHINE;

  if (!opportunityId) {
    navigate({ to: ClientsRoute.to });
  }

  const determineLatestState = useCallback(() => (STATE_MACHINE_ROUTES as unknown as (keyof typeof _STATE_MACHINE)[])
    .reduceRight((currentValue, nextValue) => {
      if (currentValue !== null) return currentValue;
      return (_STATE_MACHINE[nextValue].isAccessible ? nextValue : currentValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, null as unknown as keyof typeof _STATE_MACHINE), [_STATE_MACHINE]);

  // eslint-disable-next-line max-len, unicorn/prefer-at
  const currentStateIndex = STATE_MACHINE_ROUTES.indexOf(routerState.matches[routerState.matches.length - 1]?.routeId?.replace(layoutRoute.id, '')!);
  const upcomingStateIndex = currentStateIndex + 1;
  // eslint-disable-next-line max-len
  const isNextStateAccessible = _STATE_MACHINE[STATE_MACHINE_ROUTES[upcomingStateIndex] as (keyof typeof _STATE_MACHINE)]?.isAccessible;

  const unlockNextStep = () => {
    if (latestStateIndex === STATE_MACHINE_ROUTES.length - 1) {
      return;
    }

    if (latestStateIndex === currentStateIndex) {
      const updatedStateIndex = latestStateIndex + 1;
      setLatestStateIndex(updatedStateIndex);
      setTimeout(() => { navigate({ to: STATE_MACHINE_ROUTES[updatedStateIndex], params: { opportunityId } }); }, 500);
    }
  };

  const goToNextState = () => {
    if (currentStateIndex === STATE_MACHINE_ROUTES.length - 1
      || (hasSelectedBanks && upcomingStateIndex > latestStateIndex)) {
      return;
    }

    navigate({ to: STATE_MACHINE_ROUTES[upcomingStateIndex], params: { opportunityId } });
  };

  const goToPreviousState = () => {
    if (currentStateIndex === 0) {
      return;
    }

    navigate({ to: STATE_MACHINE_ROUTES[currentStateIndex - 1], params: { opportunityId } });
  };

  const goToState = (stateIdx: number) => {
    if (stateIdx > STATE_MACHINE_ROUTES.length - 1 || stateIdx > latestStateIndex) {
      return;
    }
    navigate({ to: STATE_MACHINE_ROUTES[stateIdx], params: { opportunityId } });
  };

  useEffect(() => {
    setLatestStateIndex(STATE_MACHINE_ROUTES.indexOf(determineLatestState()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STATE_MACHINE_ROUTES]);

  // This useEffect handles redirection in case if the state is not accessible
  // It also redirects user to the latest state reached if landed on the aggregage (/submission) route
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    if (!opportunity || !vaultProgress) {
      navigate({ to: CasesRoute.to });
    } else if (
      opportunity.bank_applications.length > 0
      && opportunity?.bank_applications.every(
        (item) => item.status !== BANK_APPLICATION_STATUS.draft
      )
    ) {
      navigate({
        to: ClientDetailsRoute.to,
        params: { id: opportunity?.client_external_id! },
        search: { tab: 'cases' },
      });
    }

    // routerState matches have prepended /layout in the path, so it has to be stripped
    // eslint-disable-next-line max-len, unicorn/prefer-at
    const stateTryingToAccess = (routerState.matches[routerState.matches.length - 1]?.routeId)?.replace(layoutRoute.id, '') as unknown as keyof typeof _STATE_MACHINE;
    const stateTryingToAccessIndex = STATE_MACHINE_ROUTES.indexOf(stateTryingToAccess);

    // check if aggregate route, if yes redirect to the latest step advanced
    if ((stateTryingToAccess as unknown as keyof typeof STATE_MACHINE) === CaseCreationSubmissionRootRoute.to
    && STATE_MACHINE_ROUTES[latestStateIndex] !== stateTryingToAccess) {
      // TODO: Fox memory leak
      navigate({
        to: STATE_MACHINE_ROUTES[latestStateIndex],
        params: { opportunityId },
      });
    }

    // check if route can be accesed, if yes do a return
    if (stateTryingToAccess && (_STATE_MACHINE[stateTryingToAccess]?.isAccessible
      || stateTryingToAccessIndex <= latestStateIndex)) {
      return;
    }

    // if the state is not accessible, go to initial state
    navigate({
      to: STATE_MACHINE_ROUTES[0],
      params: { opportunityId },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(opportunity),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(vaultProgress),
    isEnabled,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(routerState.matches)
  ]);

  return {
    unlockNextStep,
    goToNextState,
    goToPreviousState,
    isNextStateAccessible,
    goToState,
    latestStateIndex,
    STATE_MACHINE,
  };
};

export default useCaseCreationStateMachineEngine;
