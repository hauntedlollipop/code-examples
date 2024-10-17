import { Opportunity } from '@modules/opportunities/entities/opportunity/opportunity.entity';
import { useMemo } from 'react';
import useVaultProgress from '@modules/vault/hooks/queries/useVaultProgress';
import { APPLICANT_TYPE } from '@modules/opportunities/entities/opportunity/const';
import {
  CaseCreationBasicInfoRoute,
  CaseCreationBankDocumentsRoute,
  CaseCreationBankFormsRoute,
  CaseCreationSubmitApplicationsRoute,
  CaseCreationSubmissionRootRoute,
  CaseCreationFillFormsRoute,
  CaseCreationSelectBankProductsRoute
} from '@modules/opportunities/presentation/v2/routes';
import { BUSINESS_IDENTIFIER } from '@modules/core/api/const';
import { IS_SPAIN_ENV } from '@modules/core/utils';
import { CASE_CREATION_RULES } from '../rules';
import { mapOpportunityDataToCaseBasicInfoFormES, mapOpportunityDataToCaseBasicInfoFormUAE } from '../views/CaseBasicInfo/mappers';
import { caseBasicInfoSchemaUAE } from '../views/CaseBasicInfo/validators/ae';
import { caseBasicInfoSchemaES } from '../views/CaseBasicInfo/validators/es';
import { CaseCreationEngine } from './useCaseCreationStateMachineEngine';

const calculateBasicInfoCompletedStepsNumber = (opportunity?: Opportunity, hasAdditionalApplicant?: boolean) => {
  if (opportunity) {
    const schemas = {
      [BUSINESS_IDENTIFIER.AE_HUSPY]: caseBasicInfoSchemaUAE.safeParse(
        mapOpportunityDataToCaseBasicInfoFormUAE(opportunity)
      ),
      [BUSINESS_IDENTIFIER.ES_BAYTECA]: caseBasicInfoSchemaES.safeParse(
        mapOpportunityDataToCaseBasicInfoFormES(opportunity as unknown as Opportunity<'ES'>)
      ),
    };
    const err = schemas[APPLICATION_BUSINESS_IDENTIFIER];
    let numberOfCompletedFields = CASE_CREATION_RULES.BASIC_INFO_REQUIRED_NUMBER_OF_FIELDS(hasAdditionalApplicant);
    if (!err.success) {
      numberOfCompletedFields -= err.error.errors.length;
    }

    return numberOfCompletedFields;
  }

  return 0;
};

const useComputeCaseCreationState = ({ opportunity, vaultProgress, hasSelectedBanks }: {
  opportunity?: Opportunity,
  vaultProgress?: ReturnType<typeof useVaultProgress>['data'],
  hasSelectedBanks: boolean,
}) => {
  const hasAdditionalApplicant = opportunity?.applicants.some(
    (item) => item.applicant_type !== APPLICANT_TYPE.mainApplicant
  );

  const STATE_MACHINE = useMemo(
    (): CaseCreationEngine.StateMachine => {
      const basicInfoProgress = calculateBasicInfoCompletedStepsNumber(opportunity, hasAdditionalApplicant);
      const basicInfoTotalSteps = CASE_CREATION_RULES.BASIC_INFO_REQUIRED_NUMBER_OF_FIELDS(hasAdditionalApplicant);
      const isBankProductsStepCompleted = CASE_CREATION_RULES.BANK_SUBMISSION.BANK_PRODUCTS_COMPLETION(
        opportunity?.bank_applications.map((bankApp) => !!bankApp.bank_details.selected_rate.is_default_rate) ?? []
      );
      const isBankFormsStepCompleted = CASE_CREATION_RULES.BANK_SUBMISSION.BANK_FORMS_COMPLETION(
        opportunity?.bank_applications.map((bankApp) => bankApp.documents.length > 0) ?? []
      );

      return {
        [CaseCreationBasicInfoRoute.to]: {
          isAccessible: true,
          isComplete: basicInfoProgress === basicInfoTotalSteps,
          stateMetadata: {
            completedSteps: basicInfoProgress,
            totalSteps: basicInfoTotalSteps,
          },
        },
        [CaseCreationBankDocumentsRoute.to]: {
          isAccessible: hasSelectedBanks,
          isComplete: CASE_CREATION_RULES.BANK_DOCUMENTS_COMPLETION(
            vaultProgress?.documentProgress?.uploaded,
            vaultProgress?.documentProgress?.total
          ),
          stateMetadata: {
            completedSteps: vaultProgress?.documentProgress?.uploaded!,
            totalSteps: vaultProgress?.documentProgress?.total!,
          },
        },
        [CaseCreationFillFormsRoute.to]: {
          isAccessible: hasSelectedBanks && basicInfoProgress === basicInfoTotalSteps,
          isComplete: false,
          isSkipped: IS_SPAIN_ENV,
        },
        [CaseCreationSubmissionRootRoute.to]: {
          isAccessible: hasSelectedBanks && basicInfoProgress === basicInfoTotalSteps,
          isComplete: false,
        },
        [CaseCreationSelectBankProductsRoute.to]: {
          isAccessible: hasSelectedBanks && basicInfoProgress === basicInfoTotalSteps,
          isComplete: isBankProductsStepCompleted,
        },
        [CaseCreationBankFormsRoute.to]: {
          isAccessible: hasSelectedBanks && basicInfoProgress === basicInfoTotalSteps
          && (IS_SPAIN_ENV || isBankProductsStepCompleted),
          isComplete: isBankFormsStepCompleted,
        },
        [CaseCreationSubmitApplicationsRoute.to]: {
          isAccessible: hasSelectedBanks && basicInfoProgress === basicInfoTotalSteps && isBankFormsStepCompleted,
          isComplete: false,
        },
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opportunity, vaultProgress?.documentProgress]
  );

  return { STATE_MACHINE };
};

export default useComputeCaseCreationState;
