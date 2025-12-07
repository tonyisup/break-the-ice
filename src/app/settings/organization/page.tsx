"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useState } from "react";
import { CollapsibleSection } from "@/components/collapsible-section/CollapsibleSection";
import { Id } from "@/../convex/_generated/dataModel";

const OrganizationSettings = () => {
  const organizations = useQuery(api.organizations.getOrganizations);
  const invitations = useQuery(api.organizations.getInvitations);

  const createOrganization = useMutation(api.organizations.createOrganization);
  const inviteMember = useMutation(api.organizations.inviteMember);
  const acceptInvitation = useMutation(api.organizations.acceptInvitation);

  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "member">(
    "member"
  );

  const handleCreateOrganization = async () => {
    if (newOrgName.trim() !== "") {
      await createOrganization({ name: newOrgName });
      setNewOrgName("");
    }
  };

  const handleInviteMember = async (organizationId: Id<"organizations">) => {
    if (inviteEmail.trim() !== "") {
      await inviteMember({
        email: inviteEmail,
        organizationId,
        role: inviteRole,
      });
      setInviteEmail("");
    }
  };

  const handleAcceptInvitation = async (invitationId: Id<"invitations">) => {
    await acceptInvitation({ invitationId });
  };

  return (
    <CollapsibleSection title="Organization Management" isOpen={true}>
      <div className="space-y-4">
        {organizations && organizations.length > 0 ? (
          organizations.map(
            (org) =>
              org && (
                <div key={org._id}>
                  <h3 className="text-lg font-semibold dark:text-white text-black mb-2">
                    {org.name}
                  </h3>
                  {/* Member list will go here */}
                  <div className="flex space-x-2">
                    <input
                      type="email"
                      placeholder="Email to invite"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="border rounded px-2 py-1"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(
                          e.target.value as "admin" | "manager" | "member"
                        )
                      }
                      className="border rounded px-2 py-1"
                    >
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => handleInviteMember(org._id)}
                      className="bg-blue-500 text-white px-4 py-2 rounded"
                    >
                      Invite
                    </button>
                  </div>
                </div>
              )
          )
        ) : (
          <div>
            <h3 className="text-lg font-semibold dark:text-white text-black mb-2">
              Create an Organization
            </h3>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Organization Name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="border rounded px-2 py-1"
              />
              <button
                onClick={handleCreateOrganization}
                className="bg-blue-500 text-white px-4 py-2 rounded"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {invitations && invitations.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold dark:text-white text-black mb-2">
              Pending Invitations
            </h3>
            <ul className="space-y-2">
              {invitations.map((invitation) => (
                <li
                  key={invitation._id}
                  className="flex items-center justify-between"
                >
                  <span>
                    You have been invited to join an organization as a{" "}
                    {invitation.role}.
                  </span>
                  <button
                    onClick={() => handleAcceptInvitation(invitation._id)}
                    className="bg-green-500 text-white px-4 py-2 rounded"
                  >
                    Accept
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default OrganizationSettings;
