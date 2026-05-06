import { createContext, useContext, useState } from 'react';

const PageActionsContext = createContext({ node: null, setNode: () => {} });

export function PageActionsProvider({ children }) {
    const [node, setNode] = useState(null);
    return (
        <PageActionsContext.Provider value={{ node, setNode }}>
            {children}
        </PageActionsContext.Provider>
    );
}

export function usePageActions() {
    return useContext(PageActionsContext);
}
