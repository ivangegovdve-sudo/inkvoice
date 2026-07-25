# Interface Design for Testability

Good interfaces make testing natural:

1. **Accept dependencies, don't create them**

   ```typescript
   // Testable
   const processOrder = (order, paymentGateway) => {}

   // Hard to test
   const processOrder = order => {
     const gateway = new StripeGateway()
   }
   ```

2. **Return results, don't produce side effects**

   ```typescript
   // Testable
   const calculateDiscount = (cart): Discount => {}

   // Hard to test
   const applyDiscount = (cart): void => {
     cart.total -= discount
   }
   ```

3. **Small surface area**
   - Fewer methods = fewer tests needed
   - Fewer params = simpler test setup
