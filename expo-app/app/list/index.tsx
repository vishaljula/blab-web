import { View } from "react-native";
import { useRouter } from "expo-router";
import { useListingFormStore } from "@/store/listingForm";
import { useListingsStore } from "@/store/listings";

// Shared steps
import Step1Type      from "@/components/listing-steps/Step1PropertyType";
import Step2Location  from "@/components/listing-steps/Step2Location";   // NOW step 2
import Step3Path      from "@/components/listing-steps/Step2PathChoice"; // NOW step 3

// Self-list path
import Step4Details   from "@/components/listing-steps/Step3DetailsPrice";
import Step5Review    from "@/components/listing-steps/Step4Review";

// Realtor path
import Step4Realtors  from "@/components/listing-steps/Step4RealtorList";

/**
 * New flow:
 *   Self-list  (5 steps): Type → Location → PathChoice → Details+Price → Review
 *   Realtor    (4 steps): Type → Location → PathChoice → RealtorList
 */
const SELF_STEPS    = [Step1Type, Step2Location, Step3Path, Step4Details, Step5Review];
const REALTOR_STEPS = [Step1Type, Step2Location, Step3Path, Step4Realtors];

export default function ListWizard() {
  const router = useRouter();
  const { token, user } = useListingsStore();
  const { currentStep, listingPath } = useListingFormStore();

  if (!token) {
    router.replace("/login");
    return null;
  }
  if (user?.role === "buyer") {
    router.back();
    return null;
  }

  const steps = listingPath === "realtor" ? REALTOR_STEPS : SELF_STEPS;
  const StepComponent = steps[currentStep - 1] ?? steps[steps.length - 1];

  return (
    <View style={{ flex: 1 }}>
      <StepComponent />
    </View>
  );
}
