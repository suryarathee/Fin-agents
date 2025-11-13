class ConnectionException(Exception):
    def __init__(self, message):
        super().__init__(message)


class CommsHandler(CommsHandlerABC):
    def __init__(self):
        self.current_connection = set()

    def connect(self, user1: User, user2: User) -> str:
        if user1 == user2:
            raise ConnectionException(f"{user1.name} cannot connect with {user2.name}")

        if self.current_connection:
            raise ConnectionException("Connection in use. Please try later")

        self.current_connection = {user1, user2}
        return f"Connection established between {user1.name} and {user2.name}"

    def hangup(self, user1: User, user2: User) -> str:
        if user1 == user2:
            raise ConnectionException(f"{user1.name} cannot hangup with {user2.name}")

        if {user1, user2} != self.current_connection:
            raise ConnectionException(f"{user1.name} and {user2.name} not found in the communication channel")

        self.clear_all()
        return f"{user1.name} and {user2.name} are disconnected"

    def clear_all(self) -> None:
        self.current_connection = set()