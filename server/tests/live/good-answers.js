/** Realistic, correct answers to each taste-test task, used to check the grader gives them credit. */
export const GOOD_ANSWERS = {
  fullstack: `function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => setCount((c) => c + 1)}>Add</button>
    </div>
  );
}
Bugs: count was a plain variable so React never re-rendered, and onClick={count++} called the code during render instead of passing a function. To test: render it with React Testing Library, click the button, and expect the heading to read "Count: 1".`,

  backend: `POST /orders. Body: { "customerId": 12, "items": [{ "productId": 5, "quantity": 2 }] }.
Validation: customerId and items required, items non-empty, quantity integer between 1 and 100, productId must exist.
Status codes: 201 with the created order and a Location header; 400 for invalid body; 404 if the customer or a product does not exist; 409 if there is not enough stock or the same Idempotency-Key is replayed with different content; 401 if not authenticated.
SQL: CREATE TABLE orders (id BIGSERIAL PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers(id), status TEXT NOT NULL DEFAULT 'pending', total_cents INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()); CREATE TABLE order_items (order_id BIGINT REFERENCES orders(id), product_id BIGINT, quantity INT NOT NULL, PRIMARY KEY (order_id, product_id)); with an index on orders(customer_id). I would make it idempotent with an Idempotency-Key header.`,

  'qa-sdet': `Test cases: 1) valid email + valid password logs in. 2) empty email shows an error. 3) empty password shows an error. 4) password of 7 characters is rejected (below boundary). 5) password of exactly 8 characters is accepted. 6) password of 20 accepted and 21 rejected. 7) email without @ is rejected. 8) email with leading/trailing spaces is trimmed or rejected consistently. 9) SQL injection string ' OR 1=1 -- in the email field does not log in. 10) special characters and emoji in the password work. 11) wrong password shows a generic error that does not reveal whether the email exists.
Automate first: the happy path login and the 8/20 character boundary cases, because they are the most-run, highest-risk checks and are cheap to keep stable in a regression suite.`,

  'data-analyst': `SELECT c.city, SUM(o.amount) AS revenue
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.city
HAVING SUM(o.amount) > 10000
ORDER BY revenue DESC;
I would chart it as a horizontal bar chart sorted by revenue, one bar per city, so the biggest cities are easy to compare.`,

  'devops-cloud': `Dockerfile:
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

.github/workflows/ci.yml:
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test

Deploy: build the image in CI, push it to a registry on merge to main, then deploy it to a container service such as Render or AWS ECS, with a health check on port 3000 and a rollback to the previous image if the check fails.`,

  'ai-apps': `1) Extract text from the PDF and split it into chunks of about 500 tokens with 50 tokens of overlap, keeping the page number and section title as metadata. 2) Create an embedding for each chunk and store them in a vector database. 3) At question time embed the question, retrieve the top 5 chunks by similarity, and optionally rerank them. 4) Build a prompt that contains only those chunks and instructs the model to answer solely from them and to cite page numbers. 5) To stop made-up answers: tell the model to reply "I could not find this in the rules" when the chunks do not contain the answer, set a similarity threshold below which we refuse, and keep temperature low. 6) Evaluate with a set of 50 real questions with known answers and measure how often the answer is supported by the cited chunk.`,

  'support-solutions': `Reply: Hi, I am sorry your shop is down, I understand how stressful that is, and I am on it right now. I will check a few things on our side and come back to you within 15 minutes with what I find. Could you also send me the exact response body and one failing request time?
Checks in order: 1) our status page and recent deploys or incidents since this morning. 2) whether the API key was rotated, revoked or expired. 3) the Authorization header format (Bearer prefix, no extra spaces) and which environment the key belongs to. 4) the logs for this account's requests to see the exact 401 reason. 5) whether the customer's IP, plan limits or permissions changed.`,

  'product-sde': `def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
Time O(n) because each element is visited once and a dictionary lookup is O(1). Space O(n) for the dictionary. The brute force checks every pair with two nested loops, which is O(n^2) time, so the hash map is faster because it trades a little memory to avoid re-scanning the array for each element.`,
};
