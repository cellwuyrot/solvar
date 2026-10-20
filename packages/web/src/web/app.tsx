import { COMMERCE_ENABLED } from "../shared/site-policy";
import Information from "./pages/information";
import { Route, Switch } from "wouter";
const Index = lazy(() => import("./pages/index"));
import { lazy, Suspense } from "react";
const ProductPage = lazy(() => import("./pages/product"));
const Admin = lazy(() => import("./pages/admin"));
const Info = lazy(() => import("./pages/info"));
const CollectionPage = lazy(() => import("./pages/collection"));
import { Provider } from "./components/provider";
import { CartProvider } from "./components/cart-context";
import { AgeGate } from "./components/age-gate";

function LegacyStore() {
  return (
    <Provider>
      <CartProvider>
        <AgeGate bypass={window.location.pathname.startsWith("/admin")}>
        <Suspense
          fallback={
            <div className="container py-24">
              <span className="spinner" />
            </div>
          }
        >
          <Switch>
            <Route path="/" component={Index} />
            <Route path="/products/:id" component={ProductPage} />
            <Route path="/admin" component={Admin} />
            <Route path="/collections/:slug" component={CollectionPage} />
            <Route path="/info/:slug" component={Info} />
            <Route>
              <div className="container py-24">
                Страница не найдена. <a href="/">Вернуться в магазин</a>
              </div>
            </Route>
          </Switch>
        </Suspense>
        </AgeGate>
      </CartProvider>
    </Provider>
  );
}

const AdminResetPassword = lazy(() => import("./pages/admin-reset-password"));
function App() {
  if (COMMERCE_ENABLED) return <LegacyStore />;
  return <Provider><Suspense fallback={<div className="container py-24" role="status">Загрузка…</div>}><Switch>
    <Route path="/admin/reset-password" component={AdminResetPassword} />
    <Route path="/admin" component={Admin} />
    <Route component={Information} />
  </Switch></Suspense></Provider>;
}
export default App;
