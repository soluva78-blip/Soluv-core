import { ValidityAgent } from "./src/agents/validity.agent2";
import { supabase } from "./src/lib/supabase";
import { CategoriesRepository } from "./src/repositories/categories.repository";

const main = async () => {
  const categoriesRepo = new CategoriesRepository(supabase);
  const validityAgent = new ValidityAgent(categoriesRepo);

  const response =
    await validityAgent.checkValidity(`I’m an early-stage founder working on a vertical marketplace. Right now I’m trying to make sure I don’t shoot myself in the foot legally as I bring on my first users.

I know I’ll need at least:


	•	Terms of Service

	•	Privacy Policy (since I’m collecting user data)

	•	Some form of liability language (in case of things like property damage from listings, etc.)

I don’t have the budget for a full-time lawyer yet, and I’ve seen everything from auto-generated templates to hiring boutique firms.

My questions:

	•	What resources or services have you used to draft these documents?

	•	Are there any “good enough for MVP” solutions that keep you safe until you can afford formal legal help?

	•	Anything you wish you had known before putting your first legal docs in place?

I’m not looking for legal advice specific to my situation, just resources and perspective from other founders who have been through this.`);

const derviced = response.data?.derivedProblems;

console.log({ response, derviced });


};


main()